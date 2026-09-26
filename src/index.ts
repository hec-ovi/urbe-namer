import type { ChatModel } from "./llm/model.js";
import type { NamedWorld, NpcTypeSet, RunParams, WorldState } from "./types.js";
import { NamingPass, type NamingPassOptions } from "./passes/naming.js";
import { TypingPass, type PopulationStats, type TypingPassOptions } from "./passes/typing.js";
import { WorldFolder } from "./world/folder.js";
import { WorldPipeline, type WorldOptions, type WorldRun } from "./world/pipeline.js";

export type { ChatModel, ChatRequest } from "./llm/model.js";
export type { Business, NamedWorld, NamedWorldMeta, NameGender, NamePool, Nameable, NpcType, NpcTypeSet, RunParams, WorldState } from "./types.js";
export type { PopulationStats, TypingPassOptions } from "./passes/typing.js";
export type { NamingPassOptions } from "./passes/naming.js";
export type { WorldOptions, WorldRun } from "./world/pipeline.js";
export type { Progress } from "./progress.js";
export { WORLD_FILES } from "./world/folder.js";
export { AuthorPending, NamingError, type NamingErrorCode } from "./errors.js";
export { AuthorDir } from "./llm/author-dir.js";
export { exportBusinesses } from "./export/businesses.js";

/** Names every placeholder in the world against the theme; returns the named copy. */
export async function runNamingPass(world: WorldState, params: RunParams, model: ChatModel, options?: NamingPassOptions): Promise<NamedWorld> {
  return new NamingPass(model, options).run(world, params);
}

/** Creates the themed NPC type set and personal name pool for a named world.
 *  `stats` is simulation's populationStats when available; atlas stats ground it otherwise. */
export async function runTypingPass(
  world: NamedWorld,
  params: RunParams,
  stats: PopulationStats | undefined,
  model: ChatModel,
  options?: TypingPassOptions,
): Promise<NpcTypeSet> {
  return new TypingPass(model, options).run(world, params, stats);
}

/** Names a world folder end to end: reads `blueprint.json`, writes `blueprint.named.json`,
 *  `npc-types.json` and `businesses.json` beside it. `blueprint.json` is never written. */
export async function runWorld(
  folder: string,
  params: RunParams,
  stats: PopulationStats | undefined,
  model: ChatModel,
  options?: WorldOptions,
): Promise<WorldRun> {
  return new WorldPipeline(model, options).run(new WorldFolder(folder), params, stats);
}
