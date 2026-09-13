import { Readable } from "node:stream";
import { NamingError } from "../errors.js";

/** Reads streamed content, or JSON from a provider that ignores streaming. */
export async function chatContent(response: Response): Promise<string> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new NamingError("LLM_ERROR", "provider returned no text content");
    return content;
  }
  if (!response.body) throw new NamingError("LLM_ERROR", "provider returned an empty stream");
  const input = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).setEncoding("utf8");
  let content = "";
  let pending = "";
  try {
    for await (const chunk of input) {
      pending += chunk;
      const events = pending.split(/\r?\n\r?\n/);
      pending = events.pop()!;
      for (const event of events) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
          .map(line => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        if (data === "[DONE]") return content;
        const payload = JSON.parse(data);
        if (payload.error) throw new NamingError("LLM_ERROR", "provider stream failed", payload.error);
        const delta = payload.choices?.[0]?.delta?.content;
        if (delta !== undefined && delta !== null) {
          if (typeof delta !== "string") throw new NamingError("LLM_ERROR", "invalid streamed content");
          content += delta;
        }
      }
    }
    throw new NamingError("LLM_ERROR", "provider stream ended before completion");
  } finally { input.destroy(); }
}
