import type { ChatModel } from "./llm/model.js";
import type { NpcTypeSet, RunParams, WorldState } from "./types.js";
import { AnthropicModel } from "./llm/anthropic.js";
import { OpenAICompatModel } from "./llm/openai-compat.js";
import { NamingPass, type NamingPassOptions } from "./passes/naming.js";
import { TypingPass, type PopulationStats, type TypingPassOptions } from "./passes/typing.js";

export type { ChatModel, ChatRequest } from "./llm/model.js";
export type { NamePool, Nameable, NpcType, NpcTypeSet, RunParams, WorldState } from "./types.js";
export type { PopulationStats } from "./passes/typing.js";
export { NamingError, type NamingErrorCode } from "./errors.js";
export { OpenAICompatModel } from "./llm/openai-compat.js";

/** Claude by default; an OpenAI-compatible endpoint (local llama.cpp) when LLM_BASE_URL is set. */
function defaultModel(params: RunParams): ChatModel {
  return OpenAICompatModel.fromEnv(params.model) ?? new AnthropicModel(params.model);
}

/** Names every placeholder in the world against the theme; returns the named copy. */
export async function runNamingPass(
  world: WorldState,
  params: RunParams,
  model?: ChatModel,
  options?: NamingPassOptions,
): Promise<WorldState> {
  return new NamingPass(model ?? defaultModel(params), options).run(world, params);
}

/** Creates the themed NPC type set and personal name pool for a named world.
 *  `stats` is simulation's populationStats when available; atlas stats ground it otherwise. */
export async function runTypingPass(
  world: WorldState,
  params: RunParams,
  stats?: PopulationStats,
  model?: ChatModel,
  options?: TypingPassOptions,
): Promise<NpcTypeSet> {
  return new TypingPass(model ?? defaultModel(params), options).run(world, params, stats);
}
