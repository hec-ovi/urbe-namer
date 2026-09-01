import type { ChatModel } from "../llm/model.js";
import type { Nameable, NameMap, RunParams, WorldState } from "../types.js";
import { NamingError } from "../errors.js";
import { PromptLoader } from "../prompts/loader.js";
import { WorksheetBuilder } from "../world/worksheet.js";
import { NamePatcher } from "../world/patcher.js";
import { CoverageValidator } from "../validate/coverage.js";
import { SchemaValidator } from "../validate/schemas.js";
import { fewshotFile } from "./fewshots.js";
import { chunkOutputSchema, districtsOutputSchema } from "./output-schemas.js";

export interface NamingPassOptions {
  /** entities per chunk call; small enough that nothing gets dropped, large enough to stay coherent */
  chunkSize?: number;
  /** repair rounds before COVERAGE_ERROR */
  maxRepairRounds?: number;
}

interface DistrictsResult {
  charter: string;
  names: Record<string, string>;
}

/** Pass 1: names every placeholder. Districts and a naming charter come first (one call
 *  anchors the style), then per-group chunks reuse the charter; the harness merges,
 *  validates coverage and repairs. The LLM never sees or emits world geometry. */
export class NamingPass {
  private readonly prompts = new PromptLoader();
  private readonly worksheets = new WorksheetBuilder();
  private readonly patcher = new NamePatcher();
  private readonly coverage = new CoverageValidator();
  private readonly schemas = new SchemaValidator();
  private readonly chunkSize: number;
  private readonly maxRepairRounds: number;

  constructor(
    private readonly model: ChatModel,
    options: NamingPassOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? 30;
    this.maxRepairRounds = options.maxRepairRounds ?? 2;
  }

  async run(world: WorldState, params: RunParams): Promise<WorldState> {
    if (!params.theme || params.theme.trim() === "") {
      throw new NamingError("INVALID_PARAMS", "theme is required");
    }
    this.schemas.assert("world-state.schema.json", world, "INVALID_WORLD", "world state");

    const worksheet = this.worksheets.build(world);
    const districts = worksheet.filter((n) => n.group === "district");
    const rest = worksheet.filter((n) => n.group !== "district");

    const { charter, names: districtNames } = await this.nameDistricts(params.theme, districts);
    const names: Record<string, string> = { ...districtNames };

    const groups = new Map<string, Nameable[]>();
    for (const entity of rest) {
      const group = groups.get(entity.group) ?? [];
      group.push(entity);
      groups.set(entity.group, group);
    }
    const groupResults = await Promise.all(
      [...groups.entries()].map(([group, entities]) =>
        this.nameGroup(params.theme, charter, group, entities, districts, names),
      ),
    );
    for (const result of groupResults) Object.assign(names, result);

    await this.repair(params.theme, charter, worksheet, names);

    const report = this.coverage.check(worksheet, names);
    if (!report.ok) {
      throw new NamingError("COVERAGE_ERROR", "naming repair loop exhausted", report);
    }

    const named = this.patcher.apply(
      world,
      { names },
      { theme: params.theme, model: this.model.id, namedAt: new Date().toISOString() },
    );
    this.schemas.assert("world-state.schema.json", named, "COVERAGE_ERROR", "named world state");
    return named;
  }

  private async nameDistricts(theme: string, districts: Nameable[]): Promise<DistrictsResult> {
    const user = this.prompts.render("naming/districts.md", {
      theme,
      fewshots: this.prompts.render(fewshotFile("district")),
      entities: worksheetJson(districts),
    });
    const raw = await this.completeMap(user, districtsOutputSchema(districts.map((d) => d.id)));
    const charter = typeof (raw as DistrictsResult).charter === "string" ? (raw as DistrictsResult).charter : "";
    const names = extractNames(raw);
    const report = this.coverage.check(districts, names);
    if (!report.ok || charter.trim() === "") {
      throw new NamingError("COVERAGE_ERROR", "district naming incomplete or charter missing", report);
    }
    return { charter, names };
  }

  private async nameGroup(
    theme: string,
    charter: string,
    group: string,
    entities: Nameable[],
    districts: Nameable[],
    districtNames: Record<string, string>,
  ): Promise<Record<string, string>> {
    const names: Record<string, string> = {};
    const districtTable = districts
      .map((d) => `${d.id}: ${districtNames[d.id]} (${d.attrs.kind ?? "district"}, ${d.attrs.tier ?? "?"})`)
      .join("\n");
    for (let i = 0; i < entities.length; i += this.chunkSize) {
      const chunk = entities.slice(i, i + this.chunkSize);
      const user = this.prompts.render("naming/chunk.md", {
        theme,
        charter,
        group,
        districts: districtTable,
        fewshots: this.prompts.render(fewshotFile(group)),
        taken: Object.values(names).join("\n") || "(none yet)",
        entities: worksheetJson(chunk),
      });
      const schema = chunkOutputSchema(chunk.map((n) => n.id));
      Object.assign(names, extractNames(await this.completeMap(user, schema)));
    }
    return names;
  }

  /** Harness-side fixes first (drop invented ids), then focused re-requests for what is left. */
  private async repair(
    theme: string,
    charter: string,
    worksheet: Nameable[],
    names: Record<string, string>,
  ): Promise<void> {
    for (let round = 0; round < this.maxRepairRounds; round++) {
      const report = this.coverage.check(worksheet, names);
      for (const id of report.invented) delete names[id];
      const broken = [...report.missing, ...report.empty, ...report.duplicated];
      if (broken.length === 0) return;

      const byId = new Map(worksheet.map((n) => [n.id, n]));
      const entities = broken.map((id) => byId.get(id)).filter((n): n is Nameable => n !== undefined);
      const groupsToFix = new Set(entities.map((n) => n.group));
      const taken = worksheet
        .filter((n) => groupsToFix.has(n.group) && names[n.id] && !broken.includes(n.id))
        .map((n) => `${n.group}: ${names[n.id]}`)
        .join("\n");
      const user = this.prompts.render("naming/repair.md", {
        theme,
        charter,
        taken: taken || "(none)",
        entities: worksheetJson(entities),
      });
      const schema = chunkOutputSchema(entities.map((n) => n.id));
      for (const [id, name] of Object.entries(extractNames(await this.completeMap(user, schema)))) {
        if (byId.has(id)) names[id] = name;
      }
    }
  }

  private async completeMap(user: string, schema: Record<string, unknown>): Promise<unknown> {
    return this.model.completeJSON({
      system: this.prompts.render("naming/system.md"),
      user,
      schema,
    });
  }
}

function worksheetJson(entities: Nameable[]): string {
  return entities
    .map((n) => JSON.stringify({ id: n.id, placeholder: n.placeholder, ...n.attrs }))
    .join("\n");
}

function extractNames(raw: unknown): Record<string, string> {
  const container = (raw ?? {}) as Record<string, unknown>;
  const source = container.names && typeof container.names === "object" ? container.names : container;
  const names: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === "string") names[key] = value;
  }
  return names;
}
