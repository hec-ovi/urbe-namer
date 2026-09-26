import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readJson, writeJsonFile, type JsonLayout } from "./json.js";
import { exportBusinesses, runNamingPass, runTypingPass, runWorld, NamingError } from "./index.js";
import type { PopulationStats } from "./passes/typing.js";
import type { NamedWorld, RunParams, WorldState } from "./types.js";
import { WORLD_FILES } from "./world/folder.js";

const USAGE = `usage:
  world      <folder>           --theme "<world description>" [--model <id>] [--ranges '<json>'] [--stats <populationStats.json>]
             reads ${WORLD_FILES.blueprint}, writes ${WORLD_FILES.named}, ${WORLD_FILES.npcTypes} and ${WORLD_FILES.businesses} beside it
  name       <world.json>       --theme "<world description>" [--model <id>] [--out <file>]
  types      <named-world.json> --theme "<world description>" [--model <id>] [--ranges '<json>'] [--stats <populationStats.json>] [--out <file>]
  businesses <named-world.json> [--out <file>]
model server: LLM_BASE_URL (default http://localhost:8080/v1), LLM_MODEL (default: the first served model), LLM_API_KEY`;

/** The flags each command takes; every flag carries a value. */
const COMMANDS: Record<string, readonly string[]> = {
  world: ["theme", "model", "ranges", "stats"],
  name: ["theme", "model", "out"],
  types: ["theme", "model", "ranges", "stats", "out"],
  businesses: ["out"],
};

class UsageError extends Error {}

interface Args {
  command: string;
  input: string;
  flags: Record<string, string | undefined>;
}

/** The parsed command line, or "help" when it asks for the usage. */
function parse(argv: string[]): Args | "help" {
  const [command = "", ...rest] = argv;
  if (HELP.has(command)) return "help";
  const allowed = COMMANDS[command];
  if (!allowed) throw new UsageError(command ? `unknown command "${command}"` : "no command given");
  const args = withValues(rest, allowed);
  if (args.some((arg) => HELP.has(arg))) return "help";
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries(allowed.map((flag) => [flag, { type: "string" }] as const)),
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const flags = parsed.values as Record<string, string | undefined>;
  if (parsed.positionals.length !== 1) throw new UsageError(`${command} takes one input path, got ${parsed.positionals.length}`);
  for (const [flag, value] of Object.entries(flags)) {
    if (value?.trim() === "") throw new UsageError(`--${flag} is empty`);
  }
  if (allowed.includes("theme") && flags.theme === undefined) throw new UsageError(`${command} needs --theme`);
  return { command, input: here(parsed.positionals[0]), flags };
}

const HELP = new Set(["--help", "-h"]);

/** Every flag takes a value, so the argument after a known flag is its value even when it
 *  starts with "-": a free-text theme such as "- rainy port" passes as one argument. */
function withValues(args: string[], flags: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") return [...out, ...args.slice(i)];
    const known = args[i].startsWith("--") && flags.includes(args[i].slice(2));
    out.push(known && i + 1 < args.length ? `${args[i]}=${args[++i]}` : args[i]);
  }
  return out;
}

/** npm runs a script from the package root; a relative path means the caller's directory. */
function here(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function runParams(flags: Args["flags"]): RunParams {
  let ranges: RunParams["ranges"];
  try {
    ranges = flags.ranges ? JSON.parse(flags.ranges) : undefined;
  } catch {
    throw new NamingError("INVALID_PARAMS", "--ranges must be JSON");
  }
  return { theme: flags.theme!, model: flags.model, ranges };
}

function readStats(flags: Args["flags"]): PopulationStats | undefined {
  return flags.stats ? readJson<PopulationStats>(here(flags.stats), "INVALID_PARAMS") : undefined;
}

function write(args: Args, suffix: string, value: unknown, what: string, layout: JsonLayout = "readable"): void {
  const out = args.flags.out ? here(args.flags.out) : args.input.replace(/\.json$/, "") + suffix;
  writeJsonFile(out, value, layout);
  console.log(`${what} written to ${out}`);
}

/** Progress goes to stderr, so stdout carries only the result lines. */
const progress = (line: string): void => console.error(line);

async function main(argv: string[]): Promise<void> {
  const args = parse(argv);
  if (args === "help") {
    console.log(USAGE);
    return;
  }
  const { command, input, flags } = args;
  if (command === "world") {
    const run = await runWorld(input, runParams(flags), readStats(flags), undefined, { progress });
    console.log(
      `${input}: ${WORLD_FILES.named}, ${WORLD_FILES.npcTypes} (${run.types.types.length} types), ${WORLD_FILES.businesses} (${run.businesses.length} businesses)`,
    );
  } else if (command === "name") {
    const named = await runNamingPass(readJson<WorldState>(input), runParams(flags), undefined, { progress });
    write(args, "-named.json", named, "named world", "compact");
  } else if (command === "types") {
    const set = await runTypingPass(readJson<NamedWorld>(input), runParams(flags), readStats(flags), undefined, { progress });
    write(args, "-npc-types.json", set, "NPC type set");
  } else {
    write(args, "-businesses.json", exportBusinesses(readJson<NamedWorld>(input)), "businesses list");
  }
}

/** Details are the report the one-line message cannot carry: missing ids, a problem list.
 *  A cause stashed as the detail is already spelled out in the message, so it prints nothing. */
function detailText(detail: unknown): string | undefined {
  if (detail === undefined || detail instanceof Error) return undefined;
  const text = JSON.stringify(detail, null, 2);
  return text === undefined || text === "{}" || text === "[]" ? undefined : text;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`usage error: ${error.message}\n${USAGE}`);
  } else if (error instanceof NamingError) {
    console.error(`${error.code}: ${error.message}`);
    const detail = detailText(error.detail);
    if (detail) console.error(detail);
  } else {
    console.error(error);
  }
  process.exit(1);
});
