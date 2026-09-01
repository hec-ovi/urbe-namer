import { readFileSync, writeFileSync } from "node:fs";
import { runNamingPass, runTypingPass, NamingError } from "./index.js";
import type { PopulationStats } from "./passes/typing.js";
import type { RunParams, WorldState } from "./types.js";

const USAGE = `usage:
  name  <world.json>       --theme "<world description>" [--model <id>] [--out <file>]
  types <named-world.json> --theme "<world description>" [--ranges '<json>'] [--stats <populationStats.json>] [--model <id>] [--out <file>]`;

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

function outPath(input: string, flag: string | undefined, suffix: string): string {
  return flag ?? input.replace(/\.json$/, "") + suffix;
}

async function main(): Promise<void> {
  const { command, input, flags } = parseArgs(process.argv.slice(2));
  if (!flags.theme) fail(USAGE);
  const world = JSON.parse(readFileSync(input, "utf8")) as WorldState;
  const params: RunParams = {
    theme: flags.theme,
    model: flags.model,
    ranges: flags.ranges ? (JSON.parse(flags.ranges) as RunParams["ranges"]) : undefined,
  };

  if (command === "name") {
    const named = await runNamingPass(world, params);
    const out = outPath(input, flags.out, "-named.json");
    writeFileSync(out, JSON.stringify(named, null, 2) + "\n");
    console.log(`named world written to ${out}`);
  } else if (command === "types") {
    const stats = flags.stats
      ? (JSON.parse(readFileSync(flags.stats, "utf8")) as PopulationStats)
      : undefined;
    const set = await runTypingPass(world, params, stats);
    const out = outPath(input, flags.out, "-npc-types.json");
    writeFileSync(out, JSON.stringify(set, null, 2) + "\n");
    console.log(`NPC type set written to ${out}`);
  } else {
    fail(USAGE);
  }
}

main().catch((error: unknown) => {
  if (error instanceof NamingError) {
    console.error(`${error.code}: ${error.message}`);
    if (error.detail !== undefined) console.error(JSON.stringify(error.detail, null, 2));
  } else {
    console.error(error);
  }
  process.exit(1);
});
