import Anthropic from "@anthropic-ai/sdk";
import { NamingError } from "../errors.js";
import type { ChatModel, ChatRequest } from "./model.js";

const DEFAULT_MODEL = "claude-opus-5";

/** Claude-backed ChatModel. Streams (long creative outputs), never caps output below the
 *  model maximum, asks for JSON in the prompt and parses the text; validation and repair
 *  live in the passes. */
export class AnthropicModel implements ChatModel {
  private readonly client = new Anthropic();
  readonly id: string;

  constructor(modelId?: string) {
    this.id = modelId ?? DEFAULT_MODEL;
  }

  async completeJSON(request: ChatRequest): Promise<unknown> {
    let text: string;
    try {
      const response = await this.client.messages
        .stream({
          model: this.id,
          max_tokens: 128000,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          ...(request.schema
            ? { output_config: { format: { type: "json_schema", schema: request.schema } } }
            : {}),
        })
        .finalMessage();
      text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NamingError("LLM_ERROR", `provider failure: ${message}`, error);
    }
    return parseJson(text);
  }
}

/** Parses model output as JSON, tolerating a fenced code block around it. */
export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    throw new NamingError("LLM_ERROR", "model output is not valid JSON", { text: text.slice(0, 500) });
  }
}
