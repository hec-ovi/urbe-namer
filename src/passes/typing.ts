import type { ChatModel } from "../llm/model.js";
import type { NamePool, NpcType, NpcTypeSet, RunParams, WorldState } from "../types.js";
import { NamingError } from "../errors.js";
import { PromptLoader } from "../prompts/loader.js";
import { SchemaValidator } from "../validate/schemas.js";
import { typingOutputSchema } from "./output-schemas.js";
import { asArray } from "../json.js";

const MIN_POOL = 20;

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
}

/** Pass 2: creates the dynamic NPC type strings with a prompt boilerplate each.
 *  One call over a statistics summary of the named world; ranges are minimums and
 *  maximums, never quotas; grounding may only reference what the world contains. */
export class TypingPass {
  private readonly prompts = new PromptLoader();
  private readonly schemas = new SchemaValidator();
  private readonly maxRepairRounds: number;

  constructor(
    private readonly model: ChatModel,
    options: TypingPassOptions = {},
  ) {
    this.maxRepairRounds = options.maxRepairRounds ?? 2;
  }

  async run(world: WorldState, params: RunParams, stats?: PopulationStats): Promise<NpcTypeSet> {
    if (!params.theme || params.theme.trim() === "") {
      throw new NamingError("INVALID_PARAMS", "theme is required");
    }
    const ranges = { ...DEFAULT_RANGES, ...(params.ranges ?? {}) };
    for (const [category, range] of Object.entries(ranges)) {
      if (range.min > range.max) {
        throw new NamingError("INVALID_PARAMS", `range for ${category}: min ${range.min} > max ${range.max}`);
      }
    }
    this.schemas.assert("world-state.schema.json", world, "INVALID_WORLD", "world state");
    if (!world.meta.naming) {
      throw new NamingError("INVALID_WORLD", "typing pass needs a named world (run the naming pass first)");
    }

    const ground = this.grounding(world);
    const summary = this.summarize(world, ground, stats);
    const rangesText = Object.entries(ranges)
      .map(([category, r]) => `${category}: at least ${r.min}, at most ${r.max}`)
      .join("\n");

    let user = this.prompts.render("typing/task.md", {
      theme: params.theme,
      summary,
      ranges: rangesText,
      fewshots: this.prompts.render("fewshots/typing/types.md"),
    });

    let types: NpcType[] = [];
    let namePool: NamePool = emptyPool();
    let problems: string[] = [];
    for (let round = 0; round <= this.maxRepairRounds; round++) {
      if (round > 0) {
        user = this.prompts.render("typing/repair.md", {
          theme: params.theme,
          summary,
          ranges: rangesText,
          problems: problems.join("\n"),
          previous: JSON.stringify({ types, namePool: modelSide(namePool) }, null, 2),
        });
      }
      const raw = await this.model.completeJSON({
        system: this.prompts.render("typing/system.md"),
        user,
        schema: typingOutputSchema(ground),
      });
      types = extractTypes(raw);
      namePool = extractPool(raw);
      problems = [...this.validate(types, ranges, ground), ...validatePool(namePool)];
      if (problems.length === 0) break;
    }
    if (problems.length > 0) {
      const rangeOnly = problems.every((p) => p.startsWith("range:"));
      throw new NamingError(
        rangeOnly ? "RANGE_ERROR" : "COVERAGE_ERROR",
        "typing repair loop exhausted",
        problems,
      );
    }

    const set: NpcTypeSet = {
      meta: {
        theme: params.theme,
        worldSeed: world.meta.seed,
        model: this.model.id,
        createdAt: new Date().toISOString(),
      },
      types,
      namePool,
    };
    this.schemas.assert("npc-types.schema.json", set, "COVERAGE_ERROR", "NPC type set");
    return set;
  }

  /** What the world actually contains: the closed reference space for grounding. */
  private grounding(world: WorldState) {
    const districts = asArray(world.districts);
    const parcels = asArray(world.parcels);
    return {
      districtNames: new Set(districts.map((d) => String(d.name))),
      parcelTypes: new Set(parcels.map((p) => String(p.type))),
      tiers: new Set([...districts, ...parcels].map((e) => String(e.tier))),
    };
  }

  private summarize(
    world: WorldState,
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
    if (types.length === 0) {
      problems.push("output: no types found; return {\"types\": [...]}");
      return problems;
    }
    const seen = new Set<string>();
    const perCategory: Record<string, number> = {};
    for (const t of types) {
      if (!/^[a-z][a-z0-9_]*$/.test(t.type ?? "")) problems.push(`type ${t.type}: not a snake_case machine string`);
      if (seen.has(t.type)) problems.push(`type ${t.type}: duplicated`);
      seen.add(t.type);
      if (!(t.category in ranges)) problems.push(`type ${t.type}: unknown category ${t.category}`);
      else perCategory[t.category] = (perCategory[t.category] ?? 0) + 1;
      if (!t.boilerplate || t.boilerplate.trim() === "") problems.push(`type ${t.type}: empty boilerplate`);
      if (!(typeof t.weight === "number" && t.weight > 0)) problems.push(`type ${t.type}: weight must be a positive number`);
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

function emptyPool(): NamePool {
  return { given: [], givenByGender: { male: [], female: [], neutral: [] }, family: [] };
}

/** What the model owns: the flat `given` list is derived here, so it never comes back edited. */
function modelSide(pool: NamePool): Pick<NamePool, "givenByGender" | "family"> {
  return { givenByGender: pool.givenByGender, family: pool.family };
}

/** Trims, drops empties and dedupes case-insensitively; deterministic harness-side cleanup.
 *  Given names dedupe across the three gender lists, so a name lands in exactly one, and the
 *  flat `given` list is their union: the tags and the flat list can never drift apart. */
function extractPool(raw: unknown): NamePool {
  const container = ((raw ?? {}) as Record<string, unknown>).namePool as Record<string, unknown> | undefined;
  const tagged = (container?.givenByGender ?? {}) as Record<string, unknown>;
  const givenSeen = new Set<string>();
  const givenByGender = {
    male: clean(tagged.male, givenSeen),
    female: clean(tagged.female, givenSeen),
    neutral: clean(tagged.neutral, givenSeen),
  };
  return {
    given: [...givenByGender.male, ...givenByGender.female, ...givenByGender.neutral],
    givenByGender,
    family: clean(container?.family, new Set()),
  };
}

function clean(value: unknown, seen: Set<string>): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    const key = name.toLowerCase();
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function validatePool(pool: NamePool): string[] {
  const problems: string[] = [];
  if (pool.given.length < MIN_POOL) {
    problems.push(
      `pool: ${pool.given.length} distinct given names across male, female and neutral, need at least ${MIN_POOL} in total`,
    );
  }
  if (pool.family.length < MIN_POOL) {
    problems.push(`pool: ${pool.family.length} distinct family names, need at least ${MIN_POOL}`);
  }
  return problems;
}
