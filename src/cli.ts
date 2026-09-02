import { readFileSync, writeFileSync } from "node:fs";
import { exportBusinesses, runNamingPass, runTypingPass, runWorld, NamingError } from "./index.js";
import type { PopulationStats } from "./passes/typing.js";
import type { RunParams, WorldState } from "./types.js";
import { WORLD_FILES } from "./world/folder.js";

const USAGE = `usage:
  world      <folder>           --theme "<world description>" [--ranges '<json>'] [--stats <populationStats.json>] [--model <id>]
             reads ${WORLD_FILES.blueprint}, writes ${WORLD_FILES.named}, ${WORLD_FILES.npcTypes} and ${WORLD_FILES.businesses} beside it
  name       <world.json>       --theme "<world description>" [--model <id>] [--out <file>]
  types      <named-world.json> --theme "<world description>" [--ranges '<json>'] [--stats <populationStats.json>] [--model <id>] [--out <file>]
  businesses <named-world.json> [--out <file>]`;

interface Args {
  command: string;
  input: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): Args {
  const [command, input, ...rest] = argv;
  if (!command || !input) fail(USAGE);
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith("--") || rest[i + 1] === undefined) fail(USAGE);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, input, flags };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(input: string, flag: string | undefined, suffix: string, value: unknown, what: string): void {
  const out = flag ?? input.replace(/\.json$/, "") + suffix;
  writeFileSync(out, JSON.stringify(value, null, 2) + "\n");
  console.log(`${what} written to ${out}`);
}

function runParams(flags: Record<string, string>): RunParams {
  if (!flags.theme) fail(USAGE);
  return {
    theme: flags.theme,
    model: flags.model,
    ranges: flags.ranges ? (JSON.parse(flags.ranges) as RunParams["ranges"]) : undefined,
  };
}

function readStats(flags: Record<string, string>): PopulationStats | undefined {
  return flags.stats ? readJson<PopulationStats>(flags.stats) : undefined;
}

async function main(): Promise<void> {
  const { command, input, flags } = parseArgs(process.argv.slice(2));

  if (command === "world") {
    const run = await runWorld(input, runParams(flags), readStats(flags));
    console.log(
      `${input}: ${WORLD_FILES.named}, ${WORLD_FILES.npcTypes} (${run.types.types.length} types), ${WORLD_FILES.businesses} (${run.businesses.length} businesses)`,
    );
  } else if (command === "name") {
    const named = await runNamingPass(readJson<WorldState>(input), runParams(flags));
    writeJson(input, flags.out, "-named.json", named, "named world");
  } else if (command === "types") {
    const set = await runTypingPass(readJson<WorldState>(input), runParams(flags), readStats(flags));
    writeJson(input, flags.out, "-npc-types.json", set, "NPC type set");
  } else if (command === "businesses") {
    writeJson(input, flags.out, "-businesses.json", exportBusinesses(readJson<WorldState>(input)), "businesses list");
  } else {
    fail(USAGE);
  }
}

/** Details are the report the one-line message cannot carry: missing ids, a problem list.
 *  A cause stashed as the detail is already spelled out in the message, so it prints nothing. */
function detailText(detail: unknown): string | undefined {
  if (detail === undefined || detail instanceof Error) return undefined;
  const text = JSON.stringify(detail, null, 2);
  return text === undefined || text === "{}" || text === "[]" ? undefined : text;
}

main().catch((error: unknown) => {
  if (error instanceof NamingError) {
    console.error(`${error.code}: ${error.message}`);
    const detail = detailText(error.detail);
    if (detail) console.error(detail);
  } else {
    console.error(error);
  }
  process.exit(1);
});
