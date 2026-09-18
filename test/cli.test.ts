import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { ROOT, folder, removeFolders, tempDir } from './fixture.js';

afterAll(removeFolders);

/** Runs the published npm script with the provider stubbed inside the child process. */
async function cli(args: string[]) {
  const env = { ...process.env, LLM_BASE_URL: 'https://model.test', NODE_OPTIONS: `--import tsx --import ${new URL('./cli-model.ts', import.meta.url).href}` };
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key as keyof typeof env];
  const logs = tempDir('cli-logs-');
  const stdout = join(logs, 'stdout');
  const stderr = join(logs, 'stderr');
  const out = openSync(stdout, 'w');
  const err = openSync(stderr, 'w');
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn('npm', ['run', '--silent', args[0], '--', ...args.slice(1)], { cwd: ROOT, env, stdio: ['ignore', out, err] });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    return { code, stdout: readFileSync(stdout, 'utf8'), stderr: readFileSync(stderr, 'utf8') };
  } finally { closeSync(out); closeSync(err); }
}

it('writes the world-folder artifacts through the CLI and fails usage with status 1', async () => {
  const dir = folder();
  const run = await cli(['world', dir, '--theme', 'rain-soaked port city']);
  expect(run.code).toBe(0);
  expect(readdirSync(dir).sort()).toEqual(['blueprint.json', 'blueprint.named.json', 'businesses.json', 'npc-types.json']);
  expect(JSON.parse(readFileSync(join(dir, 'blueprint.named.json'), 'utf8')).meta.naming.model).toBe('stub-model');

  const usage = await cli(['world', folder()]);
  expect(usage.code).toBe(1);
  expect(usage.stderr).toContain('usage:');
});

it('supports each single-file command and its output flags', async () => {
  const dir = folder();
  const source = join(dir, 'blueprint.json');
  const named = join(dir, 'named.json');
  expect((await cli(['name', source, '--theme', 'port city', '--model', 'picked', '--out', named])).code).toBe(0);
  expect(JSON.parse(readFileSync(named, 'utf8')).meta.naming.model).toBe('picked');

  const stats = join(dir, 'stats.json');
  writeFileSync(stats, JSON.stringify({ population: 5200, households: 2100, employed: 2600, unemployed: 700, perDistrict: [] }));
  expect((await cli(['types', named, '--theme', 'port city', '--stats', stats, '--ranges', '{"worker":{"min":1,"max":2}}'])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-npc-types.json'), 'utf8')).types.length).toBeGreaterThan(0);

  expect((await cli(['businesses', named])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-businesses.json'), 'utf8')).length).toBeGreaterThan(0);
});
