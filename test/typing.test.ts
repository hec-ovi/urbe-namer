import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { runNamingPass, runTypingPass } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import type { PopulationStats } from "../src/passes/typing.js";
import { FakeModel, FAMILY, GOOD_TYPES, POOL } from "./fake-model.js";

const PARAMS = { theme: "a rain-soaked dystopian megacity" };

const STATS: PopulationStats = {
  population: 5200,
  households: 2100,
  employed: 2600,
  unemployed: 700,
  perDistrict: [
    { districtId: "d1", population: 1800, households: 800, byTier: { poor: { population: 1800, employed: 900, unemployed: 400 } } },
  ],
};

let namedWorld: WorldState;

beforeAll(async () => {
  const world = JSON.parse(
    readFileSync(new URL("../fixtures/blueprint-small.json", import.meta.url), "utf8"),
  ) as WorldState;
  namedWorld = await runNamingPass(world, PARAMS, new FakeModel());
});

describe("runTypingPass", () => {
  it("returns a grounded type set with a themed name pool", async () => {
    const model = new FakeModel(() => ({ types: GOOD_TYPES, namePool: POOL }));
    const set = await runTypingPass(namedWorld, PARAMS, STATS, model);

    expect(set.types.map((t) => t.type)).toContain("vat_worker");
    expect(set.namePool.family.length).toBeGreaterThanOrEqual(20);
    expect(set.meta).toMatchObject({ theme: PARAMS.theme, worldSeed: "fixture-small", model: "fake-model" });
  });

  it("tags every given name by gender and keeps the flat list as their union", async () => {
    const model = new FakeModel(() => ({ types: GOOD_TYPES, namePool: POOL }));
    const { given, givenByGender } = (await runTypingPass(namedWorld, PARAMS, undefined, model)).namePool;

    expect(Object.keys(givenByGender).sort()).toEqual(["female", "male", "neutral"]);
    expect(given).toEqual([...givenByGender.male, ...givenByGender.female, ...givenByGender.neutral]);
    expect(given.length).toBeGreaterThanOrEqual(20);
  });

  it("accepts an all-neutral pool for a theme whose names carry no gender", async () => {
    const neutral = Array.from({ length: 22 }, (_, i) => `Sun${i}`);
    const model = new FakeModel(() => ({
      types: GOOD_TYPES,
      namePool: { givenByGender: { male: [], female: [], neutral }, family: FAMILY },
    }));
    const set = await runTypingPass(namedWorld, PARAMS, undefined, model);

    expect(set.namePool.givenByGender.neutral).toEqual(neutral);
    expect(set.namePool.given).toEqual(neutral);
  });

  it("throws COVERAGE_ERROR when the tagged lists hold under 20 distinct given names in total", async () => {
    const model = new FakeModel(() => ({
      types: GOOD_TYPES,
      namePool: {
        givenByGender: { male: POOL.givenByGender.male, female: POOL.givenByGender.female.slice(0, 9), neutral: [] },
        family: FAMILY,
      },
    }));
    await expect(runTypingPass(namedWorld, PARAMS, undefined, model))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });

  it("repairs an invalid first answer by feeding the problems back", async () => {
    let calls = 0;
    const model = new FakeModel(() => {
      calls += 1;
      if (calls === 1) {
        return { types: [{ ...GOOD_TYPES[0], grounding: { districts: ["Nowhere"] } }], namePool: POOL };
      }
      return { types: GOOD_TYPES, namePool: POOL };
    });
    const set = await runTypingPass(namedWorld, PARAMS, undefined, model);
    expect(calls).toBe(2);
    expect(set.types).toHaveLength(4);
  });

  it("throws RANGE_ERROR when type counts stay outside the given ranges", async () => {
    const model = new FakeModel(() => ({ types: GOOD_TYPES, namePool: POOL }));
    const params = { ...PARAMS, ranges: { worker: { min: 2, max: 5 } } };
    await expect(runTypingPass(namedWorld, params, undefined, model))
      .rejects.toMatchObject({ code: "RANGE_ERROR" });
  });

  it("throws COVERAGE_ERROR when grounding keeps referencing things the world lacks", async () => {
    const model = new FakeModel(() => ({
      types: [{ ...GOOD_TYPES[0], grounding: { districts: ["Nowhere"] } }, ...GOOD_TYPES.slice(1)],
      namePool: POOL,
    }));
    await expect(runTypingPass(namedWorld, PARAMS, undefined, model))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });

  it("rejects malformed ranges", async () => {
    const params = { ...PARAMS, ranges: { vendor: { min: 5, max: 2 } } };
    await expect(runTypingPass(namedWorld, params, undefined, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("rejects a world that has not been named", async () => {
    const raw = JSON.parse(
      readFileSync(new URL("../fixtures/blueprint-small.json", import.meta.url), "utf8"),
    ) as WorldState;
    await expect(runTypingPass(raw, PARAMS, undefined, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_WORLD" });
  });
});
