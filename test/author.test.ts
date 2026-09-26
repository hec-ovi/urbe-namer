import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AuthorDir, runNamingPass, runTypingPass, runWorld } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import { FakeModel, GOOD_TYPES, PARAMS, POOL, answer, answerFile, authored, folder, namingAnswer, readRequest, removeFolders, stopOf, tempDir, world } from "./fixture.js";

afterAll(removeFolders);

const keys = (files: string[]) => files.map((file) => basename(file, ".md"));
const names = (named: WorldState) => (named.parcels as { name?: string }[]).map((parcel) => parcel.name);
const districtNames = (named: WorldState) => (named.districts as { name?: string }[]).map((district) => district.name);
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("AuthorDir", () => {
  it("stops once per stage with every request of the stage, and resumes from the answers on disk", async () => {
    const dir = folder();
    const author = () => new AuthorDir(join(dir, "author"), "claude-opus");
    const { result, stops } = await authored(() => runWorld(dir, PARAMS, undefined, author()));

    const batches = Array.from({ length: 8 }, (_, i) => `naming-batch-${i + 1}`);
    expect(stops).toEqual([["naming-districts-1"], batches, ["typing-1"]]);
    expect(result.named.meta.naming).toMatchObject({ theme: PARAMS.theme, model: "claude-opus" });
    expect(names(result.named)).toContain("N-p0");
    expect(result.types.types).toEqual(GOOD_TYPES);
    expect(result.types.meta.model).toBe("claude-opus");
    expect(readdirSync(join(dir, "author", "requests"))).toHaveLength(stops.flat().length);

    // answers without their requests, as a copied author dir holds them, are adopted
    rmSync(join(dir, "author", "requests"), { recursive: true });
    const again = await runWorld(dir, PARAMS, undefined, author());
    expect(names(again.named)).toEqual(names(result.named));
    expect(readdirSync(join(dir, "author", "requests"))).toHaveLength(stops.flat().length);
  });

  it("reads each answer through the pass's own checks: a name off the sign alphabet and an answer that is not JSON come back as repair requests", async () => {
    const model = new AuthorDir(tempDir());
    const run = () => runNamingPass(world(), PARAMS, model);
    // a fenced answer reads as the JSON inside it
    const [districts] = (await stopOf(run())).requests;
    writeFileSync(answerFile(districts), "```json\n" + JSON.stringify(namingAnswer(readRequest(districts), (id) => `N-${id}`)) + "\n```\n");

    const batches = (await stopOf(run())).requests;
    answer(batches, (request) => namingAnswer(request, (id) => (id === "p1" ? "Ж Bar" : `N-${id}`)));
    writeFileSync(join(model.dir, "naming-batch-3.json"), "the civic names, as prose");

    const repairs = await stopOf(run());
    expect(keys(repairs.requests)).toEqual(["naming-repair-1-1", "naming-repair-1-2"]);
    const [business, civic] = repairs.requests.map(readRequest);
    expect(business.user).toContain('"id":"p1"');
    expect(business.user).toContain('"current":"Ж Bar","problem":"unsignable"');
    expect(civic.schema).toMatchObject({ properties: { names: { required: ["p4", "p7", "p13", "p14", "p20"] } } });
    expect(civic.user).toContain('"problem":"missing"');

    answer(repairs.requests);
    const named = await run();
    expect(districtNames(named)).toEqual(["N-d0", "N-d1", "N-d2"]);
    expect(names(named)).toContain("N-p1");
    expect(names(named)).toContain("N-p13");
  });

  it("sets an answer aside when its request changed, keeping the rest", async () => {
    const dir = folder();
    const model = new AuthorDir(join(dir, "author"));
    await authored(() => runWorld(dir, PARAMS, undefined, model));

    // renaming a district changes what the typing request grounds its types in
    answer([join(model.dir, "requests", "naming-districts-1.md")], (request) => ({
      ...(namingAnswer(request, (id) => `N-${id}`) as object),
      names: { d0: { origin: "a later thought", name: "Salt Quarter" }, d1: { origin: "x", name: "N-d1" }, d2: { origin: "x", name: "N-d2" } },
    }));
    const stop = await stopOf(runWorld(dir, PARAMS, undefined, model));

    expect(keys(stop.requests)).toEqual(["typing-1"]);
    expect(readRequest(stop.requests[0]).user).toContain("Salt Quarter");
    expect(readdirSync(join(model.dir, "stale"))).toEqual(["typing-1.1.json"]);
    expect(existsSync(join(model.dir, "typing-1.json"))).toBe(false);
  });

  it("sets answers aside for another theme, numbering the copies so none is overwritten", async () => {
    const model = new AuthorDir(tempDir());
    const districts = async (theme: string, prefix: string) => {
      const stop = await stopOf(runNamingPass(world(), { theme }, model));
      expect(keys(stop.requests)).toEqual(["naming-districts-1"]);
      expect(readRequest(stop.requests[0]).user).toContain(theme);
      answer(stop.requests, (request) => namingAnswer(request, (id) => `${prefix}-${id}`));
      expect(keys((await stopOf(runNamingPass(world(), { theme }, model))).requests)[0]).toBe("naming-batch-1");
    };
    await districts("a salt-crusted harbour town", "A");
    await districts("a sunny 1950s alpine ski village", "B");
    await districts("a salt-crusted harbour town", "C");

    const stale = join(model.dir, "stale");
    expect(readdirSync(stale)).toEqual(["naming-districts-1.1.json", "naming-districts-1.2.json"]);
    expect(readJson(join(stale, "naming-districts-1.1.json")).names.d0.name).toBe("A-d0");
    expect(readJson(join(stale, "naming-districts-1.2.json")).names.d0.name).toBe("B-d0");
  });

  it("sets answers aside for another world, even one with the same ids and attributes", async () => {
    const model = new AuthorDir(tempDir());
    const first = await authored(() => runNamingPass(world(), PARAMS, model), (request) => namingAnswer(request, (id) => `A-${id}`));

    const other: WorldState = { ...world(), meta: { ...world().meta, seed: "another-city" } };
    const { result, stops } = await authored(() => runNamingPass(other, PARAMS, model), (request) => namingAnswer(request, (id) => `B-${id}`));

    expect(stops).toEqual(first.stops);
    expect([...districtNames(result), ...names(result)].filter((name) => name !== undefined && !name.startsWith("B-"))).toEqual([]);
    expect(readdirSync(join(model.dir, "stale"))).toHaveLength(first.stops.flat().length);
  });

  it("sets a typing repair aside when the answer it repairs changed", async () => {
    const named = await runNamingPass(world(), PARAMS, new FakeModel());
    const model = new AuthorDir(tempDir());
    const run = () => runTypingPass(named, PARAMS, undefined, model);
    const typing = (types: typeof GOOD_TYPES) => writeFileSync(join(model.dir, "typing-1.json"), JSON.stringify({ types, namePool: POOL }));

    await stopOf(run());
    typing(GOOD_TYPES.slice(1));
    const repair = await stopOf(run());
    expect(keys(repair.requests)).toEqual(["typing-2"]);
    expect(readRequest(repair.requests[0]).user).toContain("category resident has 0 types");
    answer(repair.requests);
    expect((await run()).types).toEqual(GOOD_TYPES);

    typing(GOOD_TYPES.slice(0, 3));
    const again = await stopOf(run());
    expect(keys(again.requests)).toEqual(["typing-2"]);
    expect(readRequest(again.requests[0]).user).toContain("category authority has 0 types");
    expect(readdirSync(join(model.dir, "stale"))).toEqual(["typing-2.1.json"]);
  });

  it("raises INVALID_PARAMS for an author dir it cannot write", async () => {
    const blocked = join(tempDir(), "a-file");
    writeFileSync(blocked, "");
    await expect(runNamingPass(world(), PARAMS, new AuthorDir(blocked))).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      message: expect.stringContaining(`cannot write to the author dir at ${join(blocked, "requests", "naming-districts-1.md")}`),
    });
  });
});
