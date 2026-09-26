/** Model-agnostic chat surface: the passes depend on this; an author dir or a test fake implements it. */

export interface ChatRequest {
  /** stable name of this request within a run ("naming-batch-03", "typing-1"): the same
   *  world and the same earlier answers give every request the same key */
  key: string;
  system: string;
  user: string;
  /** JSON schema of the expected output */
  schema: Record<string, unknown>;
}

export interface ChatModel {
  /** model id recorded in output meta */
  readonly id: string;
  /** Answers one request with parsed JSON. Throws NamingError: LLM_ERROR when the model fails,
   *  UnreadableAnswer when its answer is not JSON, AuthorPending when no answer exists yet. */
  completeJSON(request: ChatRequest): Promise<unknown>;
}
