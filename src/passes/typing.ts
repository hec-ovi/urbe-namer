import type { ChatModel } from "../llm/model.js";
import type { NamedWorld, NpcType, NpcTypeSet, RunParams } from "../types.js";
import { NamingError, UnreadableAnswer } from "../errors.js";
import { PromptLoader } from "../prompts/loader.js";
import { SchemaValidator } from "../validate/schemas.js";
import { NamedWorldValidator } from "../validate/named-world.js";
import { typingOutputSchema } from "./output-schemas.js";
import { asArray } from "../json.js";
import { stopwatch, type Progress } from "../progress.js";
import { extractPool, modelSide, poolProblems } from "./name-pool.js";

/** simulation's PopulationStats (../simulation/src/schemas/population.ts), consumed loosely. */
export interface PopulationStats {
  population: number;
  households: number;
  employed: number;
  unemployed: number;
  perDistrict: {
    districtId: string;
    population: number;
    households: number;
    byTier: Partial<Record<string, { population: number; employed: number; unemployed: number }>>;
  }[];
}

const DEFAULT_RANGES: Record<string, { min: number; max: number }> = {
  resident: { min: 1, max: 8 },
  worker: { min: 1, max: 10 },
  vendor: { min: 1, max: 10 },
  authority: { min: 1, max: 6 },
  transit: { min: 0, max: 4 },
  street: { min: 0, max: 6 },
};

export interface TypingPassOptions {
  maxRepairRounds?: number;
  /** receives one line per finished step */
  progress?: Progress;
}

/** Pass 2: creates the dynamic NPC type strings with a prompt boilerplate each.
 *  One call over a statistics summary of the named world; ranges are minimums and
 *  maximums, never quotas; grounding may only reference what the world contains.
 *  Repair rounds fix broken answers and name pools that read like a generator's. */
export class TypingPass {
  private readonly prompts = new PromptLoader();
  private readonly schemas = new SchemaValidator();
  private readonly namedWorlds: NamedWorldValidator = new NamedWorldValidator();
  private readonly maxRepairRounds: number;
  private readonly progress: Progress;

  constructor(
    private readonly model: ChatModel,
    options: TypingPassOptions = {},
  ) {
    this.schemas.options(options);
    this.maxRepairRounds = options.maxRepairRounds ?? 2;
    this.progress = options.progress ?? (() => {});
  }

  async run(world: NamedWorld, params: RunParams, stats?: PopulationStats): Promise<NpcTypeSet> {
    this.schemas.params(params);
    const ranges = { ...DEFAULT_RANGES, ...(params.ranges ?? {}) };
    this.namedWorlds.assert(world, "INVALID_WORLD");
    if (stats !== undefined) this.schemas.assert("population-stats.schema.json", stats, "INVALID_PARAMS", "population stats");

    const ground = this.grounding(world);
    const summary = this.summarize(world, ground, stats);
    const rangesText = Object.entries(ranges)
      .map(([category, r]) => `${category}: at least ${r.min}, at most ${r.max}`)
      .join("\n");

    /** what every round's prompt shows, and with the world's seed what each answer is written for */
    const asked = { theme: params.theme, summary, ranges: rangesText };
    const task = this.prompts.render("typing/task.md", { ...asked, fewshots: this.prompts.render("fewshots/typing/types.md") });

    const meta = { theme: params.theme, worldSeed: world.meta.seed, model: this.model.id, createdAt: new Date().toISOString() };
    const elapsed = stopwatch();
    /** the latest readable answer and what is wrong with it */
    let answer: Pick<NpcTypeSet, "types" | "namePool"> | undefined;
    let broken: string[] = [];
    let problems: string[] = [];
    /** why the latest answer could not be read, when it could not */
    let unreadable: string | undefined;
    /** the latest answer without broken parts: a name pool that only reads poorly is still usable */
    let usable: Pick<NpcTypeSet, "types" | "namePool"> | undefined;
    for (let round = 0; round <= this.maxRepairRounds; round++) {
      const time = stopwatch();
      // until one answer has been read there is nothing to repair, so the task is asked again
      const repair = answer && {
        problems: [...(unreadable ? [`your last answer could not be read (${unreadable}); answer in the requested JSON shape`] : []), ...problems].join("\n"),
        previous: JSON.stringify({ types: answer.types, namePool: modelSide(answer.namePool) }, null, 2),
      };
      const request = {
        key: `typing-${round + 1}`,
        basis: JSON.stringify({ seed: meta.worldSeed, ...asked, ...repair }),
        system: this.prompts.render("typing/system.md"),
        user: repair ? this.prompts.render("typing/repair.md", { ...asked, ...repair }) : task,
        schema: typingOutputSchema(ground),
      };
      let raw: unknown;
      try {
        raw = await this.model.completeJSON(request);
      } catch (error) {
        if (!(error instanceof UnreadableAnswer)) throw error;
        unreadable = error.message;
        this.progress(`typing: round ${round + 1}, unreadable answer in ${time()}`);
        continue;
      }
      unreadable = undefined;
      answer = { types: extractTypes(raw), namePool: extractPool(raw) };
      try {
        this.schemas.assert("npc-types.schema.json", { meta, ...answer }, "COVERAGE_ERROR", "NPC type set");
        broken = this.validate(answer.types, ranges, ground);
      } catch (error) {
        if (!(error instanceof NamingError)) throw error;
        broken = [error.message];
      }
      if (broken.length === 0) usable = answer;
      problems = [...broken, ...poolProblems(answer.namePool)];
      this.progress(`typing: round ${round + 1}, NPC types (${answer.types.length}), problems (${problems.length}) in ${time()}`);
      if (problems.length === 0) break;
    }
    if (!usable) {
      if (unreadable) throw new NamingError("LLM_ERROR", `typing repair rounds ran out; the last answer could not be read: ${unreadable}`, problems);
      const rangeOnly = broken.every((p) => p.startsWith("range:"));
      throw new NamingError(rangeOnly ? "RANGE_ERROR" : "COVERAGE_ERROR", "typing repair rounds ran out", problems);
    }
    const { given, family } = usable.namePool;
    this.progress(`typing: done, NPC types (${usable.types.length}), given names (${given.length}), family names (${family.length}) in ${elapsed()}`);
    return { meta, ...usable };
  }

  /** What the world actually contains: the closed reference space for grounding. */
  private grounding(world: NamedWorld) {
    const districts = asArray(world.districts);
    const parcels = asArray(world.parcels);
    return {
      districtNames: new Set(districts.map((d) => String(d.name))),
      parcelTypes: new Set(parcels.map((p) => String(p.type))),
      tiers: new Set([...districts, ...parcels].map((e) => String(e.tier))),
    };
  }

  private summarize(
    world: NamedWorld,
    ground: ReturnType<TypingPass["grounding"]>,
    stats?: PopulationStats,
  ): string {
    const districts = asArray(world.districts);
    const parcels = asArray(world.parcels);
    const lines: string[] = [];
    for (const d of districts) {
      const counts: Record<string, number> = {};
      for (const p of parcels) {
        if (p.districtId === d.id) counts[String(p.type)] = (counts[String(p.type)] ?? 0) + 1;
      }
      const countText = Object.entries(counts)
        .map(([type, n]) => `${type} x${n}`)
        .join(", ");
      lines.push(`- ${d.name} (${d.kind}, tier ${d.tier}): ${countText || "no parcels"}`);
    }
    const transit = (world.transit ?? {}) as Record<string, unknown[]>;
    const transitText = ["busRoutes", "trainLines", "subwayLines"]
      .map((k) => `${k}: ${asArray(transit[k]).length}`)
      .join(", ");
    lines.push(`Transit: ${transitText}`);
    lines.push(`Wealth tiers present: ${[...ground.tiers].join(", ")}`);
    if (stats) {
      lines.push(
        `Population ${stats.population}, households ${stats.households}, employed ${stats.employed}, unemployed ${stats.unemployed}.`,
      );
      for (const d of stats.perDistrict) {
        const district = districts.find((x) => x.id === d.districtId);
        const tierText = Object.entries(d.byTier)
          .map(([tier, t]) => `${tier}: ${t?.population ?? 0} people, ${t?.unemployed ?? 0} unemployed`)
          .join("; ");
        lines.push(`- ${district?.name ?? d.districtId} demographics: ${tierText}`);
      }
    } else {
      const worldStats = world.stats as { population?: number } | undefined;
      if (worldStats?.population) lines.push(`Population estimate ${worldStats.population}.`);
    }
    return lines.join("\n");
  }

  private validate(
    types: NpcType[],
    ranges: Record<string, { min: number; max: number }>,
    ground: ReturnType<TypingPass["grounding"]>,
  ): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    const perCategory: Record<string, number> = {};
    for (const t of types) {
      if (seen.has(t.type)) problems.push(`type ${t.type}: duplicated`);
      seen.add(t.type);
      perCategory[t.category] = (perCategory[t.category] ?? 0) + 1;
      if (!t.boilerplate || t.boilerplate.trim() === "") problems.push(`type ${t.type}: empty boilerplate`);
      for (const d of t.grounding?.districts ?? []) {
        if (!ground.districtNames.has(d)) problems.push(`type ${t.type}: grounding district "${d}" not in the world`);
      }
      for (const p of t.grounding?.parcelTypes ?? []) {
        if (!ground.parcelTypes.has(p)) problems.push(`type ${t.type}: grounding parcel type "${p}" not in the world`);
      }
      for (const tier of t.grounding?.tiers ?? []) {
        if (!ground.tiers.has(tier)) problems.push(`type ${t.type}: grounding tier "${tier}" not in the world`);
      }
    }
    for (const [category, range] of Object.entries(ranges)) {
      const n = perCategory[category] ?? 0;
      if (n < range.min) problems.push(`range: category ${category} has ${n} types, minimum is ${range.min}`);
      if (n > range.max) problems.push(`range: category ${category} has ${n} types, maximum is ${range.max}`);
    }
    return problems;
  }
}

function extractTypes(raw: unknown): NpcType[] {
  const container = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(container.types) ? container.types : Array.isArray(raw) ? raw : [];
  return list as NpcType[];
}
