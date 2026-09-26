import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { ROOT, WORKDIR, folder, removeFolders, tempDir } from './fixture.js';

afterAll(removeFolders);

/** Runs the published npm script, as Compose would, with the provider stubbed inside the
 *  child process. `cwd` other than the box root runs it through `npm --prefix`. */
async function cli(args: string[], { cwd = ROOT, env: extra = {} }: { cwd?: string; env?: Record<string, string> } = {}) {
  const env = { ...process.env, LLM_BASE_URL: 'https://model.test', NODE_OPTIONS: `--import tsx --import ${new URL('./cli-model.ts', import.meta.url).href}` };
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY', 'INIT_CWD']) delete env[key as keyof typeof env];
  Object.assign(env, extra);
  const logs = tempDir('cli-logs-');
  const stdout = join(logs, 'stdout');
  const stderr = join(logs, 'stderr');
  const out = openSync(stdout, 'w');
  const err = openSync(stderr, 'w');
  const npm = [...(cwd === ROOT ? [] : ['--prefix', ROOT]), 'run', '--silent', args[0], '--', ...args.slice(1)];
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn('npm', npm, { cwd, env, stdio: ['ignore', out, err] });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    return { code, stdout: readFileSync(stdout, 'utf8'), stderr: readFileSync(stderr, 'utf8') };
  } finally { closeSync(out); closeSync(err); }
}

it('writes the world-folder artifacts from a path relative to the caller, reporting progress on stderr', async () => {
  const dir = folder();
  // Compose passes unset variables through as empty strings
  const run = await cli(['world', basename(dir), '--theme', 'rain-soaked port city'], { cwd: WORKDIR, env: { LLM_MODEL: '', LLM_API_KEY: '' } });
  expect(run.code).toBe(0);
  expect(readdirSync(dir).sort()).toEqual(['blueprint.json', 'blueprint.named.json', 'businesses.json', 'npc-types.json']);
  expect(JSON.parse(readFileSync(join(dir, 'blueprint.named.json'), 'utf8')).meta.naming.model).toBe('stub-model');
  expect(run.stdout.trim()).toBe(`${dir}: blueprint.named.json, npc-types.json (4 types), businesses.json (10 businesses)`);
  expect(run.stderr).toMatch(/^naming: charter and districts \(3\) in \d+\.\ds$/m);
  expect(run.stderr).toMatch(/^typing: done, NPC types \(4\), given names \(25\), family names \(25\) in \d+\.\ds$/m);
});

it('refuses a missing theme, an unknown flag and a missing input with status 1 and the usage', async () => {
  for (const args of [['world', folder()], ['world', folder(), '--theme', 'x', '--them', 'y'], ['name', '--theme', 'x']]) {
    const run = await cli(args);
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/^usage error: .+\nusage:/);
  }
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
