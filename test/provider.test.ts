import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runNamingPass } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import { wellBehaved } from "./fake-model.js";

const PARAMS = { theme: "a rain-soaked dystopian megacity" };

interface ChatBody {
  model: string;
  authorization?: string;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: { type: string; json_schema?: { schema: Record<string, unknown> } };
}

/** Stub OpenAI-compatible server: lists one model, answers every chat completion from the
 *  request's json_schema the way the fake model does. */
const seen: ChatBody[] = [];
let server: Server;
let baseUrl: string;
const savedEnv = { ...process.env };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/models") {
        res.end(JSON.stringify({ data: [{ id: "stub-model" }] }));
        return;
      }
      const request = {
        ...(JSON.parse(body) as ChatBody),
        authorization: req.headers.authorization,
      };
      seen.push(request);
      const answer = wellBehaved({ system: "", user: "", schema: request.response_format?.json_schema?.schema });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  process.env = savedEnv;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function world(): WorldState {
  return JSON.parse(readFileSync(new URL("../fixtures/blueprint-small.json", import.meta.url), "utf8"));
}

describe("provider from the environment", () => {
  it("talks to the server at LLM_BASE_URL and takes its first listed model when LLM_MODEL is unset", async () => {
    process.env = { ...savedEnv, LLM_BASE_URL: baseUrl };
    delete process.env.LLM_MODEL;
    delete process.env.LLM_PROVIDER;
    seen.length = 0;

    const named = await runNamingPass(world(), PARAMS);

    expect(named.meta.naming?.model).toBe("stub-model");
    expect(seen[0]).toMatchObject({ model: "stub-model", response_format: { type: "json_schema" } });
  });

  it("lets the model param override the served model", async () => {
    process.env = { ...savedEnv, LLM_BASE_URL: baseUrl };
    seen.length = 0;

    const named = await runNamingPass(world(), { ...PARAMS, model: "picked" });

    expect(named.meta.naming?.model).toBe("picked");
    expect(seen.every((request) => request.model === "picked")).toBe(true);
  });

  it("uses Claude through the compatible endpoint without an output-token limit", async () => {
    process.env = {
      ...savedEnv,
      LLM_PROVIDER: "anthropic",
      LLM_BASE_URL: baseUrl,
      ANTHROPIC_API_KEY: "test-key",
    };
    delete process.env.LLM_MODEL;
    seen.length = 0;

    const named = await runNamingPass(world(), PARAMS);

    expect(named.meta.naming?.model).toBe("claude-opus-5");
    expect(seen[0]).toMatchObject({ model: "claude-opus-5", authorization: "Bearer test-key" });
    expect(seen[0]).not.toHaveProperty("max_tokens");
    expect(seen[0]).not.toHaveProperty("max_completion_tokens");
  });

  it("surfaces an unreachable server as LLM_ERROR", async () => {
    process.env = { ...savedEnv, LLM_BASE_URL: "http://127.0.0.1:9" };
    delete process.env.LLM_MODEL;

    await expect(runNamingPass(world(), PARAMS)).rejects.toMatchObject({ code: "LLM_ERROR" });
  });
});
