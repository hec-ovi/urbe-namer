import { describe, expect, it } from "vitest";
import { runNamingPass } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import { FakeModel, PARAMS, requiredIds, world } from "./fixture.js";

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
function undoNaming(named: WorldState): { named: string[]; stripped: unknown } {
  const names: string[] = [];
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node === null || typeof node !== "object") return node;
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "name" && typeof obj.id === "string") names.push(obj.id);
      else out[key] = strip(value);
    }
    return out;
  };
  const stripped = strip(named) as { meta: Record<string, unknown> };
  delete stripped.meta.naming;
  return { named: names.sort(), stripped };
}

/** The nameables the pass promises to name: districts, non-residential parcels, transit but bus stops. */
function policyIds(source: WorldState): string[] {
  const transit = (source.transit ?? {}) as Record<string, { id: string }[]>;
  return [
    ...(source.districts as { id: string }[]).map((d) => d.id),
    ...(source.parcels as { id: string; type: string }[]).filter((p) => p.type !== "residential").map((p) => p.id),
    ...["trainStations", "subwayStations", "trainLines", "subwayLines", "busRoutes"].flatMap((k) =>
      (transit[k] ?? []).map((e) => e.id),
    ),
  ].sort();
}

describe("runNamingPass", () => {
  it("names the policy set and preserves all source data", async () => {
    const source = world();
    const before = structuredClone(source);
    const named = await runNamingPass(source, PARAMS, new FakeModel(), { chunkSize: 1 });

    expect(source).toEqual(before);
    const { named: namedIds, stripped } = undoNaming(named);
    expect(namedIds).toEqual(policyIds(source));
    expect(stripped).toEqual(source);
    expect(named.meta.naming).toMatchObject({ theme: PARAMS.theme, model: "fake-model" });
    expect(new Date(named.meta.naming.namedAt).toISOString()).toBe(named.meta.naming.namedAt);
  });

  it("takes explicit placeholders as-is when the state pre-labels them", async () => {
    const source = world("world-explicit.json");
    ((source.parcels as { id: string; type: string }[]).find((parcel) => parcel.id === "p2")!).type = "offices";
    const named = await runNamingPass(source, PARAMS, new FakeModel());
    const byId = new Map(collect(named).map((e) => [e.id, e]));

    expect(byId.get("p0")!.name).toBe("N-p0");
    expect(byId.get("p2")!.name).toBeUndefined();
  });

  it("folds accents onto the sign alphabet and repairs names that cannot spell on a sign", async () => {
    const model = new FakeModel((request) => {
      const ids = requiredIds(request.schema);
      const isRepair = request.user.includes("came back with problems");
      const unspellable: Record<string, string> = { p1: "Café  Nöir ", p2: "Ж Bar", p3: "A".repeat(33) };
      const names = Object.fromEntries(
        ids.map((id) => [id, !isRepair && unspellable[id] ? unspellable[id] : `N-${id}`]),
      );
      const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
      return wantsCharter ? { charter: "c", names } : { names };
    });
    const named = await runNamingPass(world(), PARAMS, model);
    const byId = new Map(collect(named).map((e) => [e.id, e]));

    expect(byId.get("p1")!.name).toBe("Cafe Noir");
    expect(byId.get("p2")!.name).toBe("N-p2");
    expect(byId.get("p3")!.name).toBe("N-p3");
  });

  it("reports a blank theme, an unnameable world and unrepairable duplicates by code", async () => {
    await expect(runNamingPass(world(), { theme: " " }, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_PARAMS" });

    const empty = { meta: { seed: 1 }, districts: [], parcels: [] } as unknown as WorldState;
    await expect(runNamingPass(empty, PARAMS, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_WORLD" });

    const colliding = new FakeModel((request) => {
      const ids = requiredIds(request.schema);
      const names = Object.fromEntries(ids.map((id) => [id, id.startsWith("d") ? `N-${id}` : "Same Name"]));
      const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
      return wantsCharter ? { charter: "c", names } : { names };
    });
    await expect(runNamingPass(world(), PARAMS, colliding))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });
});
