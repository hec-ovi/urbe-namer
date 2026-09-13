import type { ChatRequest } from '../src/index.js';
import { wellBehaved } from './fake-model.js';

/** Model transport only; production request construction and response parsing still run. */
export const requests: { url: string; init?: RequestInit }[] = [];
export const modelFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, init });
  if (new URL(url).hostname !== 'model.test') throw new TypeError('model unavailable');
  if (url.endsWith('/models')) return Response.json({ data: [{ id: 'stub-model' }] });
  const body = JSON.parse(String(init?.body));
  const answer = wellBehaved({
    system: body.messages[0].content,
    user: body.messages[1].content,
    schema: body.response_format?.json_schema?.schema,
  } as ChatRequest);
  if (!body.stream || body.model === 'picked') {
    return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
  }
  const text = JSON.stringify(answer);
  const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`;
  const bytes = new TextEncoder().encode(`: keepalive\r\n\r\n${event(text.slice(0, 5))}${event(text.slice(5))}data: [DONE]\r\n\r\n`);
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + 7));
      offset = Math.min(offset + 7, bytes.length);
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
};
