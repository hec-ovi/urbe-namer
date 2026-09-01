import { NamingError } from "../errors.js";
import type { ChatModel, ChatRequest } from "./model.js";
import { parseJson } from "./parse.js";

/** OpenAI-compatible endpoint (local llama.cpp server and the like), selected via env:
 *  LLM_BASE_URL (root or .../v1), LLM_MODEL (server model or alias), LLM_API_KEY optional.
 *  Schemas ride response_format json_schema (llama.cpp converts them to a grammar; the
 *  expected shape is also described in every prompt, which llama.cpp relies on). */
export class OpenAICompatModel implements ChatModel {
  readonly id: string;
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    modelId: string,
    private readonly apiKey?: string,
  ) {
    const root = baseUrl.replace(/\/+$/, "");
    this.endpoint = `${root.endsWith("/v1") ? root : root + "/v1"}/chat/completions`;
    this.id = modelId;
  }

  /** Returns a model when LLM_BASE_URL is set, else undefined (caller falls back to Claude). */
  static fromEnv(modelOverride?: string): OpenAICompatModel | undefined {
    const baseUrl = process.env.LLM_BASE_URL;
    if (!baseUrl) return undefined;
    return new OpenAICompatModel(baseUrl, modelOverride ?? process.env.LLM_MODEL ?? "llm", process.env.LLM_API_KEY);
  }

  async completeJSON(request: ChatRequest): Promise<unknown> {
    const body = {
      model: this.id,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      ...(request.schema
        ? { response_format: { type: "json_schema", json_schema: { schema: request.schema } } }
        : {}),
    };
    let content: string;
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new NamingError("LLM_ERROR", `provider failure: HTTP ${response.status}`, detail);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      content = payload.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      if (error instanceof NamingError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new NamingError("LLM_ERROR", `provider failure: ${message}`, error);
    }
    return parseJson(content);
  }
}
