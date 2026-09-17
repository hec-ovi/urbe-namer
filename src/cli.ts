import { readJson, writeJsonFile, type JsonLayout } from "./json.js";
import { exportBusinesses, runNamingPass, runTypingPass, runWorld, NamingError } from "./index.js";
import type { PopulationStats } from "./passes/typing.js";
import type { NamedWorld, RunParams, WorldState } from "./types.js";
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

function writeJson(
  input: string,
  flag: string | undefined,
  suffix: string,
  value: unknown,
  what: string,
  layout: JsonLayout = "readable",
): void {
  const out = flag ?? input.replace(/\.json$/, "") + suffix;
  writeJsonFile(out, value, layout);
  console.log(`${what} written to ${out}`);
}

function runParams(flags: Record<string, string>): RunParams {
  if (!flags.theme) fail(USAGE);
  let ranges: RunParams["ranges"];
  try {
    ranges = flags.ranges ? JSON.parse(flags.ranges) : undefined;
  } catch {
    throw new NamingError("INVALID_PARAMS", "ranges must be JSON");
  }
  return {
    theme: flags.theme,
    model: flags.model,
    ranges,
  };
}

function readStats(flags: Record<string, string>): PopulationStats | undefined {
  return flags.stats ? readJson<PopulationStats>(flags.stats, "INVALID_PARAMS") : undefined;
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
    writeJson(input, flags.out, "-named.json", named, "named world", "compact");
  } else if (command === "types") {
    const set = await runTypingPass(readJson<NamedWorld>(input), runParams(flags), readStats(flags));
    writeJson(input, flags.out, "-npc-types.json", set, "NPC type set");
  } else if (command === "businesses") {
    writeJson(input, flags.out, "-businesses.json", exportBusinesses(readJson<NamedWorld>(input)), "businesses list");
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
