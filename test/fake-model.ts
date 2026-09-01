import type { ChatModel, ChatRequest } from "../src/llm/model.js";

/** Scripted ChatModel: tests inject a handler; the default plays along with the
 *  constrained output schema, naming every required id uniquely. */
export class FakeModel implements ChatModel {
  readonly id = "fake-model";
  readonly requests: ChatRequest[] = [];

  constructor(private readonly handler: (request: ChatRequest) => unknown = wellBehaved) {}

  async completeJSON(request: ChatRequest): Promise<unknown> {
    this.requests.push(request);
    return this.handler(request);
  }
}

/** Reads the ids the output schema requires and names each "N-<id>"; adds a charter when asked. */
export function wellBehaved(request: ChatRequest): unknown {
  const ids = requiredIds(request.schema);
  const names = Object.fromEntries(ids.map((id) => [id, `N-${id}`]));
  const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
  return wantsCharter ? { charter: "Test charter", names } : { names };
}

export function requiredIds(schema: Record<string, unknown> | undefined): string[] {
  const properties = schema?.properties as Record<string, { required?: string[] }> | undefined;
  return properties?.names?.required ?? [];
}
