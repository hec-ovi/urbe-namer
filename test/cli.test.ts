import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { runNamingPass } from '../src/index.js';
import { FakeModel, PARAMS, ROOT, WORKDIR, folder, removeFolders, tempDir, world } from './fixture.js';

afterAll(removeFolders);

/** Runs the published npm script with the provider stubbed inside the child process.
 *  `cwd` other than the box root runs it through `npm --prefix`; `silent: false` keeps npm's
 *  own banner, as Engine runs it. */
async function cli(args: string[], { cwd = ROOT, env: extra = {}, silent = true }: { cwd?: string; env?: Record<string, string>; silent?: boolean } = {}) {
  const env = { ...process.env, LLM_BASE_URL: 'https://model.test', NODE_OPTIONS: `--import tsx --import ${new URL('./cli-model.ts', import.meta.url).href}` };
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY', 'INIT_CWD']) delete env[key as keyof typeof env];
  Object.assign(env, extra);
  const logs = tempDir('cli-logs-');
  const stdout = join(logs, 'stdout');
  const stderr = join(logs, 'stderr');
  const out = openSync(stdout, 'w');
  const err = openSync(stderr, 'w');
  const npm = [...(cwd === ROOT ? [] : ['--prefix', ROOT]), 'run', ...(silent ? ['--silent'] : []), args[0], '--', ...args.slice(1)];
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
  // Engine's call: plain npm run, a free-text theme that may start with "-", and unset
  // variables that Compose passes through as empty strings
  const theme = '- rain-soaked port city';
  const run = await cli(['world', basename(dir), '--theme', theme], { cwd: WORKDIR, env: { LLM_MODEL: '', LLM_API_KEY: '' }, silent: false });
  expect(run.code).toBe(0);
  expect(readdirSync(dir).sort()).toEqual(['blueprint.json', 'blueprint.named.json', 'businesses.json', 'npc-types.json']);
  expect(JSON.parse(readFileSync(join(dir, 'blueprint.named.json'), 'utf8')).meta.naming).toMatchObject({ theme, model: 'stub-model' });
  // npm's banner comes first; the result is the last line
  expect(run.stdout.trim().split('\n').at(-1)).toBe(`${dir}: blueprint.named.json, npc-types.json (4 types), businesses.json (10 businesses)`);
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
  expect(await cli(['name', source, '--theme', 'port city', '--model', 'picked', '--out', named])).toMatchObject({ code: 0, stdout: `named world written to ${named}\n` });
  expect(JSON.parse(readFileSync(named, 'utf8')).meta.naming.model).toBe('picked');

  const stats = join(dir, 'stats.json');
  writeFileSync(stats, JSON.stringify({ population: 5200, households: 2100, employed: 2600, unemployed: 700, perDistrict: [] }));
  expect((await cli(['types', named, '--theme', 'port city', '--stats', stats, '--ranges', '{"worker":{"min":1,"max":2}}'])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-npc-types.json'), 'utf8')).types.length).toBeGreaterThan(0);

  expect((await cli(['businesses', named])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-businesses.json'), 'utf8')).length).toBeGreaterThan(0);
});

it('ends stderr with the error code line and its JSON detail when a run fails', async () => {
  const empty = tempDir();
  const missing = await cli(['world', empty, '--theme', 'port city']);
  expect(missing.code).toBe(1);
  expect(missing.stdout).toBe('');
  expect(missing.stderr.trim().split('\n').at(-1)).toMatch(new RegExp(`^INVALID_WORLD: cannot read JSON from ${join(empty, 'blueprint.json')}: ENOENT`));

  const named = join(tempDir(), 'named.json');
  writeFileSync(named, JSON.stringify(await runNamingPass(world(), PARAMS, new FakeModel())));
  const ranged = await cli(['types', named, '--theme', 'port city', '--ranges', '{"worker":{"min":2,"max":5}}']);
  expect(ranged.code).toBe(1);
  expect(ranged.stderr.slice(ranged.stderr.indexOf('RANGE_ERROR'))).toBe('RANGE_ERROR: typing repair rounds ran out\n[\n  "range: category worker has 1 types, minimum is 2"\n]\n');
});
