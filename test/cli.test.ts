import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { wellBehaved } from "./fake-model.js";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;
const THEME = "a rain-soaked dystopian megacity";

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** The CLI as a consumer runs it: its own process, its own environment, its own exit code. */
async function cli(args: string[], env: Record<string, string>): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run(join(root, "node_modules/.bin/tsx"), [join(root, "src/cli.ts"), ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout: string; stderr: string };
    return { code: failure.code ?? 1, stdout: failure.stdout, stderr: failure.stderr };
  }
}

/** Stub OpenAI-compatible server, the shape LLM_BASE_URL points at. */
let server: Server;
let baseUrl: string;
let dir: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "stub-model" }] }));
      const schema = JSON.parse(body).response_format?.json_schema?.schema;
      const answer = wellBehaved({ system: "", user: "", schema });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  dir = mkdtempSync(join(tmpdir(), "urbe-naming-cli-"));
  copyFileSync(join(root, "fixtures/blueprint-small.json"), join(dir, "blueprint.json"));
});

afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("npm run world", () => {
  it("names a world folder against the server at LLM_BASE_URL", async () => {
    const result = await cli(["world", dir, "--theme", THEME], { LLM_BASE_URL: baseUrl });

    expect(result.code).toBe(0);
    expect(readdirSync(dir).sort()).toEqual([
      "blueprint.json",
      "blueprint.named.json",
      "businesses.json",
      "npc-types.json",
    ]);
    expect(JSON.parse(readFileSync(join(dir, "blueprint.named.json"), "utf8")).meta.naming.model).toBe("stub-model");
    expect(result.stdout).toContain("npc-types.json");
  });

  it("reports an unreachable server as LLM_ERROR alone and writes nothing", async () => {
    const empty = mkdtempSync(join(tmpdir(), "urbe-naming-cli-down-"));
    copyFileSync(join(root, "fixtures/blueprint-small.json"), join(empty, "blueprint.json"));

    const result = await cli(["world", empty, "--theme", THEME], { LLM_BASE_URL: "http://127.0.0.1:9" });

    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toMatch(/^LLM_ERROR: no model server at http:\/\/127\.0\.0\.1:9\/v1\/models/);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(readdirSync(empty)).toEqual(["blueprint.json"]);
    rmSync(empty, { recursive: true, force: true });
  });

  it("prints usage without a theme", async () => {
    const result = await cli(["world", dir], { LLM_BASE_URL: baseUrl });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("usage:");
  });
});
