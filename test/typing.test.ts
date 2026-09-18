import { beforeAll, describe, expect, it } from "vitest";
import { runNamingPass, runTypingPass } from "../src/index.js";
import type { NamedWorld } from "../src/types.js";
import { FakeModel, GOOD_TYPES, PARAMS, POOL, STATS, world } from "./fixture.js";

let named: NamedWorld;

beforeAll(async () => {
  named = await runNamingPass(world(), PARAMS, new FakeModel());
});

describe("runTypingPass", () => {
  it("returns a grounded type set with a themed name pool", async () => {
    const model = new FakeModel(() => ({ types: GOOD_TYPES, namePool: POOL }));
    const set = await runTypingPass(named, PARAMS, STATS, model);

    expect(set.types).toEqual(GOOD_TYPES);
    expect(model.requests[0].user).toContain("households 2100");
    expect(set.namePool.given).toEqual(Object.values(set.namePool.givenByGender).flat());
    expect(new Set(set.namePool.given).size).toBeGreaterThanOrEqual(20);
    expect(set.namePool.family.length).toBeGreaterThanOrEqual(20);
    expect(set.meta).toMatchObject({ theme: PARAMS.theme, worldSeed: "fixture-small", model: "fake-model" });
  });

  it("repairs an invalid first answer and gives up with COVERAGE_ERROR when it stays invalid", async () => {
    let calls = 0;
    const recovers = new FakeModel(() => {
      calls += 1;
      return calls === 1 ? { types: [null], namePool: {} } : { types: GOOD_TYPES, namePool: POOL };
    });
    const set = await runTypingPass(named, PARAMS, undefined, recovers, { maxRepairRounds: 1 });
    expect(set.types).toEqual(GOOD_TYPES);

    const ungrounded = new FakeModel(() => ({
      types: [{ ...GOOD_TYPES[0], grounding: { districts: ["Nowhere"] } }, ...GOOD_TYPES.slice(1)],
      namePool: POOL,
    }));
    await expect(runTypingPass(named, PARAMS, undefined, ungrounded))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });

  it("throws RANGE_ERROR when type counts stay outside the given ranges", async () => {
    const model = new FakeModel(() => ({ types: GOOD_TYPES, namePool: POOL }));
    await expect(runTypingPass(named, { ...PARAMS, ranges: { worker: { min: 2, max: 5 } } }, undefined, model))
      .rejects.toMatchObject({ code: "RANGE_ERROR" });
  });

  it("rejects a named world that lost a selected name", async () => {
    const partial = structuredClone(named);
    delete ((partial.parcels as { id: string; name?: string }[]).find((p) => p.id === "p0")!).name;
    await expect(runTypingPass(partial, PARAMS, undefined, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_WORLD" });
  });
});
