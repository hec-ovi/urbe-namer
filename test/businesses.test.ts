import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { exportBusinesses, runNamingPass } from "../src/index.js";
import type { NamedWorld, WorldState } from "../src/types.js";
import { FakeModel } from "./fake-model.js";

const PARAMS = { theme: "a rain-soaked dystopian megacity" };
const ADVERTISING = ["hotel", "commerce", "mall", "restaurant", "coffee_shop", "corpo", "clinic"];

function fixture(): WorldState {
  return JSON.parse(readFileSync(new URL("../fixtures/blueprint-small.json", import.meta.url), "utf8"));
}

let namedWorld: NamedWorld;

beforeAll(async () => {
  namedWorld = await runNamingPass(fixture(), PARAMS, new FakeModel());
});

describe("exportBusinesses", () => {
  it("lists every named advertising parcel with its kind and tier, in blueprint order", () => {
    const businesses = exportBusinesses(namedWorld);
    const parcels = namedWorld.parcels as { id: string; type: string; tier: string; name?: string }[];
    const expected = parcels
      .filter((p) => ADVERTISING.includes(p.type))
      .map((p) => ({ brandName: p.name, businessKind: p.type, tier: p.tier }));

    expect(businesses).toEqual(expected);
    expect(businesses.length).toBeGreaterThan(0);
    expect(businesses.some((b) => ["offices", "police", "residential"].includes(b.businessKind))).toBe(false);
  });

  it("rejects a world that has not been named", () => {
    expect(() => exportBusinesses(fixture() as NamedWorld)).toThrow(expect.objectContaining({ code: "INVALID_WORLD" }));
  });

  it("rejects a brand name outside the sign alphabet", () => {
    const world = structuredClone(namedWorld);
    const hotel = (world.parcels as { type: string; name: string }[]).find((p) => p.type === "hotel")!;
    hotel.name = "Hotel ☃";

    expect(() => exportBusinesses(world)).toThrow(expect.objectContaining({ code: "INVALID_WORLD" }));
  });
});
