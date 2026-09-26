import { Readable } from "node:stream";
import { NamingError, UnreadableAnswer } from "../errors.js";
import { BUSY_STATUS, TransientFailure } from "./retry.js";

/** Reads streamed content, or JSON from a provider that ignores streaming. An answer the
 *  provider stopped at its length limit is unreadable, whatever it holds so far. */
export async function chatContent(response: Response): Promise<string> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const payload = await response.json();
    const choice = payload.choices?.[0];
    if (typeof choice?.message?.content !== "string") throw new NamingError("LLM_ERROR", "provider returned no text content");
    return complete(choice.message.content, choice.finish_reason);
  }
  if (!response.body) throw new NamingError("LLM_ERROR", "provider returned an empty stream");
  const input = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).setEncoding("utf8");
  let content = "";
  let finish: unknown;
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
        if (data === "[DONE]") return complete(content, finish);
        const payload = JSON.parse(data);
        if (payload.error) throw streamFailure(payload.error);
        const choice = payload.choices?.[0];
        finish = choice?.finish_reason ?? finish;
        const delta = choice?.delta?.content;
        if (delta !== undefined && delta !== null) {
          if (typeof delta !== "string") throw new NamingError("LLM_ERROR", "invalid streamed content");
          content += delta;
        }
      }
    }
    // the connection went, not the request: the same request may work next time
    throw new TransientFailure(new NamingError("LLM_ERROR", "provider stream ended before completion"));
  } finally { input.destroy(); }
}

function complete(content: string, finish: unknown): string {
  if (finish === "length") {
    throw new UnreadableAnswer("model output stopped at the provider's length limit", { text: content.slice(-500) });
  }
  return content;
}

/** An error event inside the stream: a server-side failure (llama.cpp reports a lost device
 *  as code 500) is worth another try, like the same status on the response itself. */
function streamFailure(error: unknown): Error {
  const { code, message } = (typeof error === "object" && error !== null ? error : { message: error }) as { code?: unknown; message?: unknown };
  const failure = new NamingError("LLM_ERROR", `provider stream failed: ${String(message ?? "no message")}`, error);
  return typeof code === "number" && BUSY_STATUS.has(code) ? new TransientFailure(failure) : failure;
}
