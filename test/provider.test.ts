import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runNamingPass, runTypingPass } from '../src/index.js';
import { PARAMS, world } from './fixture.js';
import { modelFetch, requests } from './provider-stub.js';

const source = world();

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('fetch', modelFetch);
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, undefined);
  vi.stubEnv('LLM_BASE_URL', 'https://model.test');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('discovers the served model, honors the environment key, reads blank variables as unset and prefers an explicit model', async () => {
  vi.stubEnv('LLM_API_KEY', 'test-key');
  const discovered = await runNamingPass(source, PARAMS);
  expect(discovered.meta.naming.model).toBe('stub-model');
  expect(requests[0].url).toBe('https://model.test/v1/models');
  expect(requests[0].init?.headers).toMatchObject({ authorization: 'Bearer test-key' });

  // Compose passes an unset variable through as an empty string
  requests.length = 0;
  vi.stubEnv('LLM_MODEL', '');
  vi.stubEnv('LLM_API_KEY', ' ');
  expect((await runNamingPass(source, PARAMS)).meta.naming.model).toBe('stub-model');
  expect(requests[0].init?.headers).not.toHaveProperty('authorization');

  vi.stubEnv('LLM_MODEL', 'environment-model');
  const picked = await runNamingPass(source, { ...PARAMS, model: 'picked' });
  expect(picked.meta.naming.model).toBe('picked');
});

it('selects the Anthropic credentials and default model, streaming without output caps', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  const named = await runNamingPass(source, PARAMS);

  expect(named.meta.naming.model).toBe('claude-opus-5');
  expect(requests[0].init?.headers).toMatchObject({ authorization: 'Bearer test-anthropic-key' });
  const body = JSON.parse(String(requests[0].init?.body));
  expect(body.stream).toBe(true);
  expect(body).not.toHaveProperty('max_tokens');
  expect(body).not.toHaveProperty('max_completion_tokens');
});

/** Settles `run` with the retry backoff played out on fake timers instead of waited for. */
async function played<T>(run: Promise<T>): Promise<T> {
  const settled = run.then((value) => ({ value }), (error: unknown) => ({ error }));
  await vi.runAllTimersAsync();
  const result = await settled;
  if ('error' in result) throw result.error;
  return result.value;
}

it('retries a busy provider, a dropped stream and a server error inside the stream, and reports LLM_ERROR when it stays busy', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  vi.stubEnv('LLM_MODEL', 'picked');
  const sse = (text: string) => new Response(text, { headers: { 'content-type': 'text/event-stream' } });
  const failures = [
    new Response('busy', { status: 503, headers: { 'retry-after': '1' } }),
    sse('data: {"error":{"code":500,"message":"decode() failed: vk::Queue::submit: ErrorDeviceLost"}}\n\n'),
    sse('data: {"choices":[{"delta":{"content":"{"}}]}\n\n'),
  ];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => failures.shift() ?? modelFetch(input, init));
  expect((await played(runNamingPass(source, PARAMS))).meta.naming.model).toBe('picked');
  expect(failures).toHaveLength(0);

  vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
  await expect(played(runNamingPass(source, PARAMS)))
    .rejects.toMatchObject({ name: 'NamingError', code: 'LLM_ERROR', message: 'provider failure at https://model.test/v1/chat/completions: HTTP 503' });
});

it('names the endpoint and the cause when the model server cannot be reached', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  vi.stubEnv('LLM_BASE_URL', 'http://127.0.0.1:9');
  vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:9') }); });
  await expect(runNamingPass(source, PARAMS)).rejects.toMatchObject({
    code: 'LLM_ERROR',
    message: 'no model server at http://127.0.0.1:9/v1/models: fetch failed (connect ECONNREFUSED 127.0.0.1:9); check LLM_BASE_URL',
  });
  await expect(played(runNamingPass(source, { ...PARAMS, model: 'picked' }))).rejects.toMatchObject({
    code: 'LLM_ERROR',
    message: 'provider failure at http://127.0.0.1:9/v1/chat/completions: fetch failed (connect ECONNREFUSED 127.0.0.1:9)',
  });
});

it('asks again for an answer cut at the length limit or not JSON, and reports LLM_ERROR when no answer can be read', async () => {
  vi.stubEnv('LLM_MODEL', 'picked');
  const unreadable = (content: string, finish: string) =>
    Response.json({ choices: [{ message: { content }, finish_reason: finish }] });
  const answers = [unreadable('{"names": {"p0": {"orig', 'length'), unreadable('not json', 'stop')];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const districts = String(init?.body).includes('"charter"');
    return !districts && answers.length > 0 ? answers.shift()! : modelFetch(input, init);
  });
  const named = await runNamingPass(source, PARAMS);
  expect(named.meta.naming.model).toBe('picked');
  expect(answers).toHaveLength(0);

  answers.push(unreadable('not json', 'stop'));
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => answers.shift() ?? modelFetch(input, init));
  expect((await runTypingPass(named, PARAMS)).types.length).toBeGreaterThan(0);
  expect(answers).toHaveLength(0);

  vi.stubGlobal('fetch', async () => unreadable('not json', 'stop'));
  await expect(runNamingPass(source, PARAMS)).rejects.toMatchObject({
    code: 'LLM_ERROR',
    message: expect.stringContaining('model answers could not be read: model output is not valid JSON'),
  });
});
