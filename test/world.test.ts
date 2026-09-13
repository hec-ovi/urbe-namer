import { copyFileSync, mkdirSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWorld, exportBusinesses } from "../src/index.js";
import { FakeModel } from "./fake-model.js";

mkdirSync(new URL("../.test-work/", import.meta.url), { recursive: true });
const workdir = new URL("../.test-work/", import.meta.url).pathname;

const PARAMS = { theme: "a rain-soaked dystopian megacity" };

const schemaFile = (name: string) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), "utf8"));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(workdir, "urbe-naming-world-"));
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

    expect(ajv.validate(schemaFile("npc-types.schema.json"), readJson(join(dir, "npc-types.json")))).toBe(true);
    expect(ajv.validate(schemaFile("businesses.schema.json"), readJson(join(dir, "businesses.json")))).toBe(true);
    expect(run.businesses).toEqual(exportBusinesses(run.named));
    expect(run.businesses.map(b => b.brandName)).toEqual([
      "N-p0", "N-p1", "N-p2", "N-p3", "N-p8", "N-p11", "N-p13", "N-p17", "N-p18", "N-p19",
    ]);
    expect(readJson(join(dir, "blueprint.named.json"))).toEqual(run.named);
    expect(readJson(join(dir, "npc-types.json"))).toEqual(run.types);
    expect(readJson(join(dir, "businesses.json"))).toEqual(run.businesses);
    expect(run.types.types.length).toBeGreaterThan(0);
  });

  it("exports an empty business list when no advertising parcels exist", async () => {
    const named = (await runWorld(dir, PARAMS, undefined, new FakeModel())).named;
    named.parcels = [];
    expect(exportBusinesses(named)).toEqual([]);
  });

  it("rejects a folder without blueprint.json", async () => {
    const empty = mkdtempSync(join(workdir, "urbe-naming-empty-"));
    expect(existsSync(join(empty, "blueprint.json"))).toBe(false);

    await expect(runWorld(empty, PARAMS, undefined, new FakeModel())).rejects.toMatchObject({ code: "INVALID_WORLD" });
    rmSync(empty, { recursive: true, force: true });
  });
});
