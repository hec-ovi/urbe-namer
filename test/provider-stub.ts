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
  return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
};
