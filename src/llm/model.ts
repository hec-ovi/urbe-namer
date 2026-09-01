/** Provider-agnostic chat model surface: the passes depend on this, tests inject a fake. */

export interface ChatRequest {
  system: string;
  user: string;
  /** JSON schema of the expected output; implementations may use it for constrained decoding. */
  schema?: Record<string, unknown>;
}

export interface ChatModel {
  /** model id recorded in output meta */
  readonly id: string;
  /** Sends one request and returns the parsed JSON output. Throws NamingError LLM_ERROR on provider failure. */
  completeJSON(request: ChatRequest): Promise<unknown>;
}
