import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { afterAll, describe, expect, it } from "vitest";
import { exportBusinesses, runWorld } from "../src/index.js";
import { FakeModel, PARAMS, ROOT, folder, removeFolders, wellBehaved } from "./fixture.js";

afterAll(removeFolders);

const schemaFile = (name: string) => JSON.parse(readFileSync(join(ROOT, "schema", name), "utf8"));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("runWorld", () => {
  it("writes the named world, the NPC type set and the businesses list beside blueprint.json, which it never touches", async () => {
    const dir = folder();
    const before = readFileSync(join(dir, "blueprint.json"), "utf8");
    const ajv = new Ajv({ allErrors: true, strict: false });

    const run = await runWorld(dir, PARAMS, undefined, new FakeModel());

    expect(readFileSync(join(dir, "blueprint.json"), "utf8")).toBe(before);
    expect(ajv.validate(schemaFile("npc-types.schema.json"), readJson(join(dir, "npc-types.json")))).toBe(true);
    expect(ajv.validate(schemaFile("businesses.schema.json"), readJson(join(dir, "businesses.json")))).toBe(true);
    expect(run.businesses[0]).toEqual({ brandName: "N-p0", businessKind: "corpo", tier: "high_rich" });
    expect(run.businesses.map((b) => b.brandName)).toEqual([
      "N-p0", "N-p1", "N-p2", "N-p3", "N-p8", "N-p11", "N-p13", "N-p17", "N-p18", "N-p19",
    ]);
    expect(readJson(join(dir, "blueprint.named.json"))).toEqual(run.named);
    expect(readFileSync(join(dir, "blueprint.named.json"), "utf8").trimEnd()).not.toContain("\n");
    expect(readJson(join(dir, "npc-types.json"))).toEqual(run.types);
    expect(readJson(join(dir, "businesses.json"))).toEqual(run.businesses);
    expect(run.types.types.length).toBeGreaterThan(0);
    expect(exportBusinesses({ ...run.named, parcels: [] })).toEqual([]);
  });

  it("keeps the completed naming artifact when the later typing stage fails", async () => {
    const dir = folder("partial-");
    const model = new FakeModel((request) =>
      (request.schema?.properties as Record<string, unknown>).types ? { types: [], namePool: {} } : wellBehaved(request),
    );

    await expect(runWorld(dir, PARAMS, undefined, model)).rejects.toMatchObject({ code: "COVERAGE_ERROR" });

    expect(readJson(join(dir, "blueprint.named.json")).meta.naming.theme).toBe(PARAMS.theme);
    expect(existsSync(join(dir, "npc-types.json"))).toBe(false);
    expect(existsSync(join(dir, "businesses.json"))).toBe(false);
  });
});
