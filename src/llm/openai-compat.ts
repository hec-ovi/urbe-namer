import { NamingError } from "../errors.js";
import type { ChatModel, ChatRequest } from "./model.js";
import { parseJson } from "./parse.js";

/** A local llama.cpp server, the project's default model host. */
const DEFAULT_BASE_URL = "http://localhost:8080/v1";

/** OpenAI-compatible endpoint (local llama.cpp server and the like), configured by env:
 *  LLM_BASE_URL (root or .../v1, default a local server), LLM_MODEL (default: the first model
 *  the server lists), LLM_API_KEY optional. Schemas ride response_format json_schema
 *  (llama.cpp converts them to a grammar; the expected shape is also described in every prompt). */
export class OpenAICompatModel implements ChatModel {
  readonly id: string;
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    modelId: string,
    private readonly apiKey?: string,
  ) {
    this.endpoint = `${apiRoot(baseUrl)}/chat/completions`;
    this.id = modelId;
  }

  /** `modelOverride` wins over LLM_MODEL; with neither, the server's first listed model. */
  static async fromEnv(modelOverride?: string): Promise<OpenAICompatModel> {
    const baseUrl = process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;
    const modelId = modelOverride ?? process.env.LLM_MODEL ?? (await firstServedModel(baseUrl, apiKey));
    return new OpenAICompatModel(baseUrl, modelId, apiKey);
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
        headers: { "content-type": "application/json", ...authHeader(this.apiKey) },
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
      throw new NamingError("LLM_ERROR", `provider failure: ${describe(error)}`, error);
    }
    return parseJson(content);
  }
}

function apiRoot(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return root.endsWith("/v1") ? root : root + "/v1";
}

function authHeader(apiKey?: string): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** GET /v1/models, first entry: what a llama.cpp server is serving right now. */
async function firstServedModel(baseUrl: string, apiKey?: string): Promise<string> {
  const url = `${apiRoot(baseUrl)}/models`;
  let payload: { data?: { id?: string }[] };
  try {
    const response = await fetch(url, { headers: authHeader(apiKey) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    throw new NamingError("LLM_ERROR", `no model server at ${url}: ${describe(error)}`, error);
  }
  const id = payload.data?.[0]?.id;
  if (!id) throw new NamingError("LLM_ERROR", `${url} lists no model; set LLM_MODEL`);
  return id;
}
