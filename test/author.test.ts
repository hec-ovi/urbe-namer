import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AuthorDir, runNamingPass, runWorld } from "../src/index.js";
import { GOOD_TYPES, PARAMS, answer, authored, folder, namingAnswer, readRequest, removeFolders, stopOf, tempDir, world } from "./fixture.js";

afterAll(removeFolders);

const keys = (files: string[]) => files.map((file) => basename(file, ".md"));
const names = (named: { parcels?: unknown }) => (named.parcels as { id: string; name?: string }[]).map((parcel) => parcel.name);

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

    // every answer is on disk: a rerun goes straight through to the same names
    const again = await runWorld(dir, PARAMS, undefined, author());
    expect(names(again.named)).toEqual(names(result.named));
    expect(readdirSync(join(dir, "author")).filter((file) => file.endsWith(".md"))).toHaveLength(stops.flat().length);
  });

  it("reads each answer through the pass's own checks: a name off the sign alphabet and an answer that is not JSON come back as repair requests", async () => {
    const model = new AuthorDir(tempDir());
    const run = () => runNamingPass(world(), PARAMS, model);
    answer((await stopOf(run())).requests);

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
    expect(names(named)).toContain("N-p1");
    expect(names(named)).toContain("N-p13");
  });

  it("sets an answer aside when its request changed under the same key, keeping the rest", async () => {
    const dir = folder();
    const model = new AuthorDir(join(dir, "author"));
    await authored(() => runWorld(dir, PARAMS, undefined, model));

    // renaming a district changes what the typing request grounds its types in
    answer([join(model.dir, "naming-districts-1.md")], (request) => ({
      ...(namingAnswer(request, (id) => `N-${id}`) as object),
      names: { d0: { origin: "a later thought", name: "Salt Quarter" }, d1: { origin: "x", name: "N-d1" }, d2: { origin: "x", name: "N-d2" } },
    }));
    const stop = await stopOf(runWorld(dir, PARAMS, undefined, model));

    expect(keys(stop.requests)).toEqual(["typing-1"]);
    expect(existsSync(join(model.dir, "typing-1.stale.json"))).toBe(true);
    expect(readRequest(stop.requests[0]).user).toContain("Salt Quarter");
    expect(readdirSync(model.dir).filter((file) => file.endsWith(".stale.json"))).toEqual(["typing-1.stale.json"]);
  });
});
