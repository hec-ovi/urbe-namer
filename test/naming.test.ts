import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runNamingPass } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import { FakeModel, requiredIds } from "./fake-model.js";

const PARAMS = { theme: "a rain-soaked dystopian megacity" };
function fixture(name: string): WorldState {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

function collect(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((item) => collect(item, out));
  else if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.id === "string") out.push(obj);
    Object.values(obj).forEach((value) => collect(value, out));
  }
  return out;
}

/** Takes the pass's own additions back out: every `name` on an identified entity and the
 *  `meta.naming` block. What is left must be the input, whatever else the blueprint carries. */
function undoNaming(world: WorldState): { named: string[]; stripped: unknown } {
  const named: string[] = [];
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node === null || typeof node !== "object") return node;
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "name" && typeof obj.id === "string") named.push(obj.id);
      else out[key] = strip(value);
    }
    return out;
  };
  const stripped = strip(world) as { meta: Record<string, unknown> };
  delete stripped.meta.naming;
  return { named: named.sort(), stripped };
}

/** The nameables the pass promises to name: districts, non-residential parcels, transit but bus stops. */
function policyIds(world: WorldState): string[] {
  const transit = (world.transit ?? {}) as Record<string, { id: string }[]>;
  return [
    ...(world.districts as { id: string }[]).map((d) => d.id),
    ...(world.parcels as { id: string; type: string }[]).filter((p) => p.type !== "residential").map((p) => p.id),
    ...["trainStations", "subwayStations", "trainLines", "subwayLines", "busRoutes"].flatMap((k) =>
      (transit[k] ?? []).map((e) => e.id),
    ),
  ].sort();
}

describe("runNamingPass", () => {
  it("names the policy set and preserves all source data", async () => {
      const world = fixture("blueprint-small.json");
      const before = structuredClone(world);
      const named = await runNamingPass(world, PARAMS, new FakeModel(), { chunkSize: 1 });
      expect(world).toEqual(before);
      const { named: namedIds, stripped } = undoNaming(named);

      expect(namedIds).toEqual(policyIds(world));
      expect(stripped).toEqual(world);
      expect(named.meta.naming).toMatchObject({ theme: PARAMS.theme, model: "fake-model" });
      expect(new Date(named.meta.naming.namedAt).toISOString()).toBe(named.meta.naming.namedAt);
    },
  );

  it("takes explicit placeholders as-is when the state pre-labels them", async () => {
    const world = fixture("world-explicit.json");
    ((world.parcels as { id: string; type: string }[]).find((parcel) => parcel.id === "p2")!).type = "offices";
    const named = await runNamingPass(world, PARAMS, new FakeModel());
    const byId = new Map(collect(named).map((e) => [e.id, e]));
    expect(byId.get("p0")!.name).toBe("N-p0");
    expect(byId.get("p2")!.name).toBeUndefined();
  });

  it("folds accents onto the sign alphabet and repairs names that cannot spell on a sign", async () => {
    const world = fixture("blueprint-small.json");
    const model = new FakeModel((request) => {
      const ids = requiredIds(request.schema);
      const isRepair = request.user.includes("came back with problems");
      const names = Object.fromEntries(
        ids.map((id) => [
          id,
          id === "p1" && !isRepair
            ? "Café  Nöir "
            : id === "p2" && !isRepair
              ? "Ж Bar"
              : id === "p3" && !isRepair
                ? "A".repeat(33)
                : `N-${id}`,
        ]),
      );
      const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
      return wantsCharter ? { charter: "c", names } : { names };
    });
    const named = await runNamingPass(world, PARAMS, model);
    const byId = new Map(collect(named).map((e) => [e.id, e]));

    expect(byId.get("p1")!.name).toBe("Cafe Noir");
    expect(byId.get("p2")!.name).toBe("N-p2");
    expect(byId.get("p3")!.name).toBe("N-p3");
  });

  it("rejects an empty theme", async () => {
    await expect(runNamingPass(fixture("blueprint-small.json"), { theme: " " }, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(runNamingPass(fixture("blueprint-small.json"), PARAMS, new FakeModel(), { chunkSize: 0 }))
      .rejects.toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("rejects a world with nothing nameable", async () => {
    const world = { meta: { seed: 1 }, districts: [], parcels: [] } as unknown as WorldState;
    await expect(runNamingPass(world, PARAMS, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_WORLD" });
  });

  it("throws COVERAGE_ERROR when repairs cannot fix duplicate names", async () => {
    const colliding = new FakeModel((request) => {
      const ids = requiredIds(request.schema);
      const names = Object.fromEntries(ids.map((id) => [id, id.startsWith("d") ? `N-${id}` : "Same Name"]));
      const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
      return wantsCharter ? { charter: "c", names } : { names };
    });
    await expect(runNamingPass(fixture("blueprint-small.json"), PARAMS, colliding))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });

});
