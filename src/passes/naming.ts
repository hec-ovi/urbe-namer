import type { ChatModel } from "../llm/model.js";
import type { NamedWorld, Nameable, RunParams, WorldState } from "../types.js";
import { AuthorPending, NamingError, UnreadableAnswer } from "../errors.js";
import { PromptLoader } from "../prompts/loader.js";
import { WorksheetBuilder } from "../world/worksheet.js";
import { NamePatcher } from "../world/patcher.js";
import { CoverageValidator, namespaceOf } from "../validate/coverage.js";
import { foldForSign, spellsOnSign } from "../validate/sign.js";
import { SchemaValidator } from "../validate/schemas.js";
import { NamedWorldValidator } from "../validate/named-world.js";
import { VarietyCheck, WordUsage, contentWords, pooled, type VarietyProblem } from "../validate/variety.js";
import { batchLabel, batchTitle, batchesOf, fewshotFile, kindMeaning } from "./batches.js";
import { readCharter, renderCharter, type Charter } from "./charter.js";
import { chunkOutputSchema, districtsOutputSchema } from "./output-schemas.js";
import { TakenNames } from "./taken-names.js";
import { stopwatch, type Progress } from "../progress.js";

export interface NamingPassOptions {
  /** entities per batch call; small enough that nothing gets dropped, large enough to stay coherent */
  chunkSize?: number;
  /** repair rounds per stage (districts, then the rest) before a failure */
  maxRepairRounds?: number;
  /** receives one line per finished step */
  progress?: Progress;
}

/** Why an entity is named again. The first three break the named world; the rest are
 *  quality, so a name still flagged for them when the rounds run out stays. */
type Problem = "missing" | "unsignable" | "duplicate" | VarietyProblem;
const QUALITY: ReadonlySet<Problem> = new Set(["banned", "overused", "echo"]);

interface Target extends Nameable {
  problem: Problem;
  current?: string;
  /** the banned or overused word, or the echoed name, behind a quality problem */
  word?: string;
}

/** What every request of one run is about: the theme and the world it names. */
interface Subject {
  theme: string;
  seed: string | number;
}

/** What every batch prompt of one run shares. */
interface RunContext extends Subject {
  charter: Charter;
  districts: string;
  variety: VarietyCheck;
  taken: TakenNames;
  /** batch prompts rendered so far, which picks each batch's turn of the motifs */
  batches: number;
}

/** Pass 1: names every placeholder. The districts and the naming charter come first (one
 *  call anchors the style), then batches of the rest follow the charter; the harness merges,
 *  checks coverage and variety, and renames what failed. The model never sees world geometry. */
export class NamingPass {
  private readonly prompts = new PromptLoader();
  private readonly worksheets = new WorksheetBuilder();
  private readonly patcher = new NamePatcher();
  private readonly coverage = new CoverageValidator();
  private readonly schemas = new SchemaValidator();
  private readonly namedWorlds: NamedWorldValidator = new NamedWorldValidator();
  private readonly chunkSize: number;
  private readonly maxRepairRounds: number;
  private readonly progress: Progress;
  /** why answers of the current run could not be read, for the failure that follows them */
  private unreadable: string[] = [];

  constructor(
    private readonly model: ChatModel,
    options: NamingPassOptions = {},
  ) {
    this.schemas.options(options);
    this.chunkSize = options.chunkSize ?? 30;
    this.maxRepairRounds = options.maxRepairRounds ?? 2;
    this.progress = options.progress ?? (() => {});
  }

  async run(world: WorldState, params: RunParams): Promise<NamedWorld> {
    this.schemas.params(params);
    this.schemas.assert("world-state.schema.json", world, "INVALID_WORLD", "world state");
    this.unreadable = [];
    const elapsed = stopwatch();

    const worksheet = this.worksheets.build(world);
    const districts = worksheet.filter((n) => n.group === "district");
    const rest = worksheet.filter((n) => n.group !== "district");
    const names: Record<string, string> = {};

    const context = await this.nameDistricts({ theme: params.theme, seed: world.meta.seed }, districts, names);
    const batches = batchesOf(rest, this.chunkSize);
    let done = 0;
    await this.stage(batches, "naming-batch", async (batch, key) => {
      const time = stopwatch();
      await this.nameBatch(context, batch, names, key);
      this.progress(`naming: batch ${++done}/${batches.length}, ${batchTitle(batch[0])} (${batch.length}) in ${time()}`);
    });
    // district names are final: every batch prompt has shown them, and names lean on them
    await this.repair(context, names, worksheet, rest, "naming-repair");

    const report = this.coverage.check(worksheet, names);
    if (!report.ok) throw this.failure("naming repair rounds ran out", report);

    const named = this.patcher.apply(
      world,
      { names },
      { theme: params.theme, model: this.model.id, namedAt: new Date().toISOString() },
    );
    this.namedWorlds.assert(named, "COVERAGE_ERROR", worksheet);
    this.progress(`naming: done, names (${worksheet.length}) in ${elapsed()}`);
    return named;
  }

  /** One call writes the charter and names the districts; a reply without a usable charter is
   *  asked again whole, and district names that failed go through the repair rounds. */
  private async nameDistricts(subject: Subject, districts: Nameable[], names: Record<string, string>): Promise<RunContext> {
    const time = stopwatch();
    const user = this.prompts.render("naming/districts.md", {
      theme: subject.theme,
      fewshots: this.prompts.render("fewshots/naming/districts.md"),
      entities: entityLines(districts),
    });
    const schema = districtsOutputSchema(districts.map((d) => d.id));
    const basis = basisOf(subject, districts);
    let raw: unknown;
    let charter: Charter | undefined;
    for (let attempt = 1; attempt <= this.maxRepairRounds + 1 && !charter; attempt++) {
      raw = await this.ask(`naming-districts-${attempt}`, basis, user, schema);
      charter = readCharter(raw);
    }
    if (!charter) throw this.failure("the district reply carried no naming charter", undefined);
    Object.assign(names, readNames(raw, districts));

    const context: RunContext = {
      ...subject,
      charter,
      districts: "(the districts are being named)",
      variety: new VarietyCheck(charter.banned),
      taken: new TakenNames(),
      batches: 0,
    };
    await this.repair(context, names, districts, districts, "naming-districts-repair");
    const report = this.coverage.check(districts, names);
    if (!report.ok) throw this.failure("district naming incomplete", report);

    context.districts = districts
      .map((d) => `${d.id}: ${names[d.id]} (${d.attrs.kind ?? "district"}, ${d.attrs.tier ?? "?"})`)
      .join("\n") || "(this city has no districts)";
    for (const district of districts) context.taken.add(namespaceOf(district), names[district.id]);
    this.progress(`naming: charter and districts (${districts.length}) in ${time()}`);
    return context;
  }

  private async nameBatch(context: RunContext, batch: Nameable[], names: Record<string, string>, key: string): Promise<void> {
    const namespace = namespaceOf(batch[0]);
    const user = this.prompts.render("naming/chunk.md", {
      theme: context.theme,
      charter: renderCharter(context.charter, context.batches++),
      districts: context.districts,
      topic: batchLabel(batch[0]),
      taken: context.taken.recent(namespace, this.chunkSize * 2).join("\n") || "(none yet)",
      fewshots: this.prompts.render(fewshotFile(batch[0])),
      entities: entityLines(batch),
    });
    const answer = readNames(await this.ask(key, basisOf(context, batch), user, chunkOutputSchema(batch.map((n) => n.id))), batch);
    for (const [id, name] of Object.entries(answer)) {
      names[id] = name;
      context.taken.add(namespace, name);
    }
  }

  /** Rounds of focused re-requests for the entities of `renamable`, judged against the names
   *  of all of `scope` and batched like the first pass, under the request keys
   *  `<key>-<round>-<batch>`. */
  private async repair(context: RunContext, names: Record<string, string>, scope: Nameable[], renamable: Nameable[], key: string): Promise<void> {
    for (let round = 1; round <= this.maxRepairRounds; round++) {
      const { targets, avoid } = this.targets(context.variety, scope, names, renamable);
      if (targets.length === 0) return;
      const time = stopwatch();
      await this.stage(batchesOf(targets, this.chunkSize), `${key}-${round}`, (batch, batchKey) =>
        this.renameBatch(context, scope, batch, avoid, names, batchKey),
      );
      this.progress(`naming: repair round ${round}, ${describe(targets)} in ${time()}`);
    }
  }

  /** Runs one stage's calls in order, the n-th under the request key `<key>-<n>`. A call its
   *  author has yet to answer stops the stage only once every call has run, so one stop
   *  writes every request of the stage. */
  private async stage<T>(items: T[], key: string, run: (item: T, key: string) => Promise<void>): Promise<void> {
    const width = String(items.length).length;
    const pending: AuthorPending[] = [];
    for (const [index, item] of items.entries()) {
      try {
        await run(item, `${key}-${String(index + 1).padStart(width, "0")}`);
      } catch (error) {
        if (!(error instanceof AuthorPending)) throw error;
        pending.push(error);
      }
    }
    if (pending.length > 0) throw AuthorPending.join(pending);
  }

  /** What in `renamable` still needs a name: coverage failures first, then variety flags. */
  private targets(
    variety: VarietyCheck,
    scope: Nameable[],
    names: Record<string, string>,
    renamable: Nameable[],
  ): { targets: Target[]; avoid: string[] } {
    const report = this.coverage.check(scope, names);
    const broken = new Map<string, Problem>();
    for (const id of [...report.missing, ...report.empty]) broken.set(id, "missing");
    for (const id of report.unsignable) broken.set(id, "unsignable");
    for (const id of report.duplicated) broken.set(id, "duplicate");
    const quality = variety.check(scope, names);
    const targets: Target[] = [];
    for (const entity of renamable) {
      const current = names[entity.id];
      const problem = broken.get(entity.id);
      const flag = quality.flagged.get(entity.id);
      if (problem) targets.push({ ...entity, problem, current });
      else if (flag) targets.push({ ...entity, problem: flag.problem, word: flag.word, current });
    }
    return { targets, avoid: quality.words };
  }

  private async renameBatch(
    context: RunContext,
    scope: Nameable[],
    batch: Target[],
    avoid: string[],
    names: Record<string, string>,
    key: string,
  ): Promise<void> {
    const namespace = namespaceOf(batch[0]);
    const user = this.prompts.render("naming/repair.md", {
      theme: context.theme,
      charter: renderCharter(context.charter, context.batches++),
      districts: context.districts,
      topic: batchLabel(batch[0]),
      avoid: avoid.join(", ") || "(none)",
      taken: context.taken.recent(namespace, this.chunkSize * 2).join("\n") || "(none yet)",
      entities: entityLines(batch),
    });
    const answer = readNames(await this.ask(key, basisOf(context, batch), user, chunkOutputSchema(batch.map((n) => n.id))), batch);

    // judged against the names as they stand now: batches of this round land in between
    const inUse = new Set<string>();
    for (const n of scope) {
      const name = names[n.id];
      // a parcel also leaves district and station names alone
      if (name && (namespaceOf(n) === namespace || (pooled(batch[0]) && !pooled(n)))) inUse.add(name.toLowerCase());
    }
    const usage = new WordUsage(scope, names);
    for (const target of batch) {
      const name = answer[target.id];
      if (name === undefined) continue;
      // a valid name is only traded for a clean one, so a quality round never breaks the world
      if (QUALITY.has(target.problem) && !this.clean(context, target, name, inUse, usage)) continue;
      if (pooled(target)) usage.trade(target.current, name);
      names[target.id] = name;
      inUse.add(name.toLowerCase());
      context.taken.add(namespace, name);
    }
  }

  /** Signable, unused, free of banned words and of the word it was flagged for, and adding
   *  no word the pool already carries to the limit. */
  private clean(context: RunContext, target: Target, name: string, inUse: Set<string>, usage: WordUsage): boolean {
    return spellsOnSign(name)
      && !inUse.has(name.toLowerCase())
      && !context.variety.bannedWord(name)
      && !(target.problem === "overused" && contentWords(name).includes(target.word!))
      && (!pooled(target) || usage.admits(target.current, name));
  }

  /** One model call. An unreadable answer names nothing, so the repair rounds ask again. */
  private async ask(key: string, basis: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.model.completeJSON({ key, basis, system: this.prompts.render("naming/system.md"), user, schema });
    } catch (error) {
      if (!(error instanceof UnreadableAnswer)) throw error;
      this.unreadable.push(error.message);
      return undefined;
    }
  }

  /** Rounds ran out. Unreadable answers on the way make it the model's failure. */
  private failure(message: string, detail: unknown): NamingError {
    if (this.unreadable.length === 0) return new NamingError("COVERAGE_ERROR", message, detail);
    const reasons = [...new Set(this.unreadable)].join("; ");
    return new NamingError("LLM_ERROR", `${message}; ${this.unreadable.length} model answers could not be read: ${reasons}`, detail);
  }
}

/** An entity as a request shows it: a rename also carries its current name and problem. */
type Entity = Nameable & Partial<Pick<Target, "problem" | "current" | "word">>;

function entityLines(entities: Entity[]): string {
  return entities
    .map((n) => JSON.stringify({ id: n.id, placeholder: n.placeholder, ...n.attrs, what: kindMeaning(n), current: n.current, problem: n.problem, word: n.word }))
    .join("\n");
}

/** What a naming answer is written for: the theme, the world and the entities it names. The
 *  charter, the district names and the names taken so far are context the checks hold it to. */
function basisOf({ theme, seed }: Subject, entities: Entity[]): string {
  return JSON.stringify({
    theme,
    seed,
    entities: entities.map(({ id, placeholder, group, attrs, current, problem, word }) => ({ id, placeholder, group, attrs, current, problem, word })),
  });
}

/** Reads the requested ids out of a reply, as `{origin, name}` entries or bare strings,
 *  folding each name onto the sign alphabet. Anything else in the reply is ignored. */
function readNames(raw: unknown, entities: Nameable[]): Record<string, string> {
  if (raw === null || typeof raw !== "object") return {};
  const container = raw as Record<string, unknown>;
  const source = (container.names !== null && typeof container.names === "object" ? container.names : container) as Record<string, unknown>;
  const names: Record<string, string> = {};
  for (const { id } of entities) {
    const value = source[id];
    const name = typeof value === "string" ? value : (value as { name?: unknown } | null | undefined)?.name;
    if (typeof name === "string") names[id] = foldForSign(name);
  }
  return names;
}

function describe(targets: Target[]): string {
  const counts = new Map<Problem, number>();
  for (const target of targets) counts.set(target.problem, (counts.get(target.problem) ?? 0) + 1);
  return `renames (${targets.length}: ${[...counts].map(([problem, n]) => `${n} ${problem}`).join(", ")})`;
}
