import type { ChatModel } from "./llm/model.js";
import type { NpcTypeSet, RunParams, WorldState } from "./types.js";
import { AnthropicModel } from "./llm/anthropic.js";
import { OpenAICompatModel } from "./llm/openai-compat.js";
import { NamingPass, type NamingPassOptions } from "./passes/naming.js";
import { TypingPass, type PopulationStats, type TypingPassOptions } from "./passes/typing.js";

export type { ChatModel, ChatRequest } from "./llm/model.js";
export type { Business, NameGender, NamePool, Nameable, NpcType, NpcTypeSet, RunParams, WorldState } from "./types.js";
export type { PopulationStats } from "./passes/typing.js";
export { NamingError, type NamingErrorCode } from "./errors.js";
export { OpenAICompatModel } from "./llm/openai-compat.js";
export { exportBusinesses } from "./export/businesses.js";

/** The OpenAI-compatible server at LLM_BASE_URL (a local llama.cpp by default);
 *  LLM_PROVIDER=anthropic switches to Claude. */
async function resolveModel(params: RunParams): Promise<ChatModel> {
  if (process.env.LLM_PROVIDER === "anthropic") return new AnthropicModel(params.model);
  return OpenAICompatModel.fromEnv(params.model);
}

/** Names every placeholder in the world against the theme; returns the named copy. */
export async function runNamingPass(
  world: WorldState,
  params: RunParams,
  model?: ChatModel,
  options?: NamingPassOptions,
): Promise<WorldState> {
  return new NamingPass(model ?? (await resolveModel(params)), options).run(world, params);
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
  return new TypingPass(model ?? (await resolveModel(params)), options).run(world, params, stats);
}
