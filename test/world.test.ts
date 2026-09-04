import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWorld } from "../src/index.js";
import { FakeModel } from "./fake-model.js";

const PARAMS = { theme: "a rain-soaked dystopian megacity" };

const schemaFile = (name: string) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), "utf8"));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "urbe-naming-world-"));
  copyFileSync(new URL("../fixtures/blueprint-small.json", import.meta.url), join(dir, "blueprint.json"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("runWorld", () => {
  it("writes the named world, the NPC type set and the businesses list beside blueprint.json, which it never touches", async () => {
    const before = readFileSync(join(dir, "blueprint.json"), "utf8");
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addSchema(schemaFile("world-state.schema.json"));

    const run = await runWorld(dir, PARAMS, undefined, new FakeModel());

    expect(readFileSync(join(dir, "blueprint.json"), "utf8")).toBe(before);
    expect(ajv.validate(schemaFile("named-world.schema.json"), readJson(join(dir, "blueprint.named.json")))).toBe(true);
    expect(ajv.validate(schemaFile("npc-types.schema.json"), readJson(join(dir, "npc-types.json")))).toBe(true);
    expect(ajv.validate(schemaFile("businesses.schema.json"), readJson(join(dir, "businesses.json")))).toBe(true);
    expect(run.businesses.length).toBeGreaterThan(0);
    expect(run.types.types.length).toBe(4);
  });

  it("reruns from the same placeholders and replaces the three outputs", async () => {
    const first = readJson(join(dir, "blueprint.named.json")).meta.naming.namedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));

    await runWorld(dir, { ...PARAMS, theme: "a medieval river town" }, undefined, new FakeModel());

    const named = readJson(join(dir, "blueprint.named.json"));
    expect(named.meta.naming.theme).toBe("a medieval river town");
    expect(named.meta.naming.namedAt).not.toBe(first);
    expect(readJson(join(dir, "npc-types.json")).meta.theme).toBe("a medieval river town");
  });

  it("rejects a folder without blueprint.json", async () => {
    const empty = mkdtempSync(join(tmpdir(), "urbe-naming-empty-"));
    expect(existsSync(join(empty, "blueprint.json"))).toBe(false);

    await expect(runWorld(empty, PARAMS, undefined, new FakeModel())).rejects.toMatchObject({ code: "INVALID_WORLD" });
    rmSync(empty, { recursive: true, force: true });
  });
});
