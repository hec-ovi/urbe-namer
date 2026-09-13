import { spawn } from 'node:child_process';
import { closeSync, openSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const workdir = join(root, '.test-work');
mkdirSync(workdir, { recursive: true });
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function folder() {
  const dir = mkdtempSync(join(workdir, 'cli-'));
  dirs.push(dir);
  copyFileSync(join(root, 'fixtures/blueprint-small.json'), join(dir, 'blueprint.json'));
  return dir;
}
async function cli(args: string[]) {
  const env = { ...process.env, LLM_BASE_URL: 'https://model.test' };
  for (const key of ['LLM_MODEL', 'LLM_PROVIDER', 'LLM_API_KEY', 'ANTHROPIC_API_KEY']) delete env[key as keyof typeof env];
  const logs = folder();
  const stdout = join(logs, 'stdout');
  const stderr = join(logs, 'stderr');
  const out = openSync(stdout, 'w');
  const err = openSync(stderr, 'w');
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--import', 'tsx', '--import', './test/cli-model.ts', 'src/cli.ts', ...args,
      ], { cwd: root, env, stdio: ['ignore', out, err] });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    return { code, stdout: readFileSync(stdout, 'utf8'), stderr: readFileSync(stderr, 'utf8') };
  } finally { closeSync(out); closeSync(err); }
}

it('writes the world-folder artifacts through the CLI', async () => {
  const dir = folder();
  const result = await cli(['world', dir, '--theme', 'rain-soaked port city']);
  expect(result.code).toBe(0);
  expect(readdirSync(dir).sort()).toEqual(['blueprint.json', 'blueprint.named.json', 'businesses.json', 'npc-types.json']);
  expect(JSON.parse(readFileSync(join(dir, 'blueprint.named.json'), 'utf8')).meta.naming.model).toBe('stub-model');
});

it('supports each single-file command and its output flags', async () => {
  const dir = folder();
  const source = join(dir, 'blueprint.json');
  const named = join(dir, 'named.json');
  expect((await cli(['name', source, '--theme', 'port city', '--model', 'picked', '--out', named])).code).toBe(0);
  expect(JSON.parse(readFileSync(named, 'utf8')).meta.naming.model).toBe('picked');
  expect((await cli(['types', named, '--theme', 'port city', '--ranges', '{"worker":{"min":1,"max":2}}'])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-npc-types.json'), 'utf8')).types.length).toBeGreaterThan(0);
  expect((await cli(['businesses', named])).code).toBe(0);
  expect(JSON.parse(readFileSync(join(dir, 'named-businesses.json'), 'utf8')).length).toBeGreaterThan(0);
});

it('reports usage errors with a failing exit code', async () => {
  const result = await cli(['world', folder()]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('usage:');
});
