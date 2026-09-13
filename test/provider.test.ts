import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runNamingPass } from '../src/index.js';
import { modelFetch, requests } from './provider-stub.js';

const world = JSON.parse(readFileSync(new URL('../fixtures/blueprint-small.json', import.meta.url), 'utf8'));
const params = { theme: 'rain-soaked port city' };
beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('fetch', modelFetch);
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, undefined);
  vi.stubEnv('LLM_BASE_URL', 'https://model.test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('discovers the served model and honors the environment key', async () => {
  vi.stubEnv('LLM_API_KEY', 'test-key');
  const named = await runNamingPass(world, params);
  expect(named.meta.naming.model).toBe('stub-model');
  expect(requests[0].url).toBe('https://model.test/v1/models');
  expect(requests[0].init?.headers).toMatchObject({ authorization: 'Bearer test-key' });
});

it('uses an explicit model ahead of the environment model', async () => {
  vi.stubEnv('LLM_MODEL', 'environment-model');
  const named = await runNamingPass(world, { ...params, model: 'picked' });
  expect(named.meta.naming.model).toBe('picked');
  expect(requests.every(r => r.url.endsWith('/chat/completions'))).toBe(true);
});

it('selects the Anthropic credentials and default model without output caps', async () => {
  vi.stubEnv('LLM_PROVIDER', 'anthropic');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
  const named = await runNamingPass(world, params);
  expect(named.meta.naming.model).toBe('claude-opus-5');
  expect(requests[0].init?.headers).toMatchObject({ authorization: 'Bearer test-anthropic-key' });
  const body = JSON.parse(String(requests[0].init?.body));
  expect(body.stream).toBe(true);
  expect(body).not.toHaveProperty('max_tokens');
  expect(body).not.toHaveProperty('max_completion_tokens');
});

it('reports provider failure through the public error envelope', async () => {
  vi.stubEnv('LLM_BASE_URL', 'https://unavailable.test');
  await expect(runNamingPass(world, params)).rejects.toMatchObject({ name: 'NamingError', code: 'LLM_ERROR' });
});

it('rejects a stream cut off before completion', async () => {
  vi.stubGlobal('fetch', async () => new Response('data: {"choices":[{"delta":{"content":"{}"}}]}\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  }));
  await expect(runNamingPass(world, { ...params, model: 'picked' }))
    .rejects.toMatchObject({ code: 'LLM_ERROR', message: 'provider stream ended before completion' });
});
