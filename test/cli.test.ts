import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { runNamingPass } from '../src/index.js';
import { FakeModel, PARAMS, ROOT, WORKDIR, answer, folder, removeFolders, tempDir, world } from './fixture.js';

afterAll(removeFolders);

interface Options { cwd?: string; silent?: boolean }

/** Runs the published npm script. `cwd` other than the box root runs it through `npm --prefix`;
 *  `silent: false` keeps npm's own banner, as Engine runs it. */
async function cli(args: string[], { cwd = ROOT, silent = true }: Options = {}) {
  const env = { ...process.env };
  delete env.INIT_CWD;
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

/** Runs the command again after each exit 2, answering the request files it lists on stdout. */
async function authored(args: string[], options?: Options) {
  for (let stops = 0; ; stops++) {
    const run = await cli(args, options);
    if (run.code !== 2 || stops === 10) return run;
    answer(run.stdout.split('\n').filter((line) => line.endsWith('.md')));
  }
}

it('writes the world-folder artifacts from a path relative to the caller, stopping with exit 2 for each stage its author has yet to answer', async () => {
  const dir = folder();
  // Engine's call: plain npm run and a free-text theme that may start with "-"
  const theme = '- rain-soaked port city';
  const args = ['world', basename(dir), '--theme', theme];
  const first = await cli(args, { cwd: WORKDIR, silent: false });
  expect(first.code).toBe(2);
  expect(first.stdout.trim().split('\n').at(-1)).toBe(join(dir, 'author', 'naming-districts-1.md'));
  expect(first.stderr).toContain(`AUTHOR_PENDING: 1 request awaits its completion in ${join(dir, 'author')}`);

  const run = await authored(args, { cwd: WORKDIR, silent: false });
  expect(run.code).toBe(0);
  expect(readdirSync(dir).sort()).toEqual(['author', 'blueprint.json', 'blueprint.named.json', 'businesses.json', 'npc-types.json']);
  expect(JSON.parse(readFileSync(join(dir, 'blueprint.named.json'), 'utf8')).meta.naming).toMatchObject({ theme, model: 'author' });
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

it('supports each single-file command and its author and output flags', async () => {
  const dir = folder();
  const source = join(dir, 'blueprint.json');
  const named = join(dir, 'named.json');
  const authorDir = tempDir('author-');
  const name = await authored(['name', source, '--theme', 'port city', '--author', authorDir, '--model', 'picked', '--out', named]);
  expect(name).toMatchObject({ code: 0, stdout: `named world written to ${named}\n` });
  expect(JSON.parse(readFileSync(named, 'utf8')).meta.naming.model).toBe('picked');
  expect(readdirSync(authorDir)).toContain('naming-districts-1.json');

  const stats = join(dir, 'stats.json');
  writeFileSync(stats, JSON.stringify({ population: 5200, households: 2100, employed: 2600, unemployed: 700, perDistrict: [] }));
  expect((await authored(['types', named, '--theme', 'port city', '--stats', stats, '--ranges', '{"worker":{"min":1,"max":2}}'])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-npc-types.json'), 'utf8')).types.length).toBeGreaterThan(0);
  expect(readdirSync(join(dir, 'author'))).toEqual(['typing-1.json', 'typing-1.md']);

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
  const ranged = await authored(['types', named, '--theme', 'port city', '--ranges', '{"worker":{"min":2,"max":5}}']);
  expect(ranged.code).toBe(1);
  expect(ranged.stderr.slice(ranged.stderr.indexOf('RANGE_ERROR'))).toBe('RANGE_ERROR: typing repair rounds ran out\n[\n  "range: category worker has 1 types, minimum is 2"\n]\n');
});
