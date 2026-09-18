import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runNamingPass } from '../src/index.js';
import { PARAMS, world } from './fixture.js';
import { modelFetch, requests } from './provider-stub.js';

const source = world();

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('fetch', modelFetch);
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, undefined);
  vi.stubEnv('LLM_BASE_URL', 'https://model.test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('discovers the served model, honors the environment key and prefers an explicit model', async () => {
  vi.stubEnv('LLM_API_KEY', 'test-key');
  const discovered = await runNamingPass(source, PARAMS);
  expect(discovered.meta.naming.model).toBe('stub-model');
  expect(requests[0].url).toBe('https://model.test/v1/models');
  expect(requests[0].init?.headers).toMatchObject({ authorization: 'Bearer test-key' });

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

it('retries a busy provider and reports LLM_ERROR when it stays busy', async () => {
  vi.stubEnv('LLM_MODEL', 'picked');
  let busy = 2;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (busy-- > 0) return new Response('busy', { status: 503, headers: { 'retry-after': '0.01' } });
    return modelFetch(input, init);
  });
  expect((await runNamingPass(source, PARAMS)).meta.naming.model).toBe('picked');

  vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
  await expect(runNamingPass(source, PARAMS))
    .rejects.toMatchObject({ name: 'NamingError', code: 'LLM_ERROR', message: 'provider failure: HTTP 503' });
});
