import { describe, expect, it } from "vitest";
import { runNamingPass } from "../src/index.js";
import type { WorldState } from "../src/types.js";
import { FakeModel, PARAMS, isDistrictRequest, isRepairRequest, namingAnswer, wellBehaved, world } from "./fixture.js";

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
    const unspellable: Record<string, string> = { p1: "Café  Nöir ", p2: "Ж Bar", p3: "A".repeat(33) };
    const model = new FakeModel((request) =>
      namingAnswer(request, (id) => (!isRepairRequest(request) && unspellable[id]) || `N-${id}`),
    );
    const named = await runNamingPass(world(), PARAMS, model);
    const byId = new Map(collect(named).map((e) => [e.id, e]));

    expect(byId.get("p1")!.name).toBe("Cafe Noir");
    expect(byId.get("p2")!.name).toBe("N-p2");
    expect(byId.get("p3")!.name).toBe("N-p3");
  });

  it("renames what breaks the charter's bans, leans on an overused word or copies a district name, keeping a valid name when no clean one comes back", async () => {
    const word = (id: string) => id.replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
    // three parcels use up "Kiln", p13 copies a district name, the rest lean on "Harbor", and three
    // never get a clean rename: p19 is offered a used-up word, p20 the very word it was flagged
    // for, d2 its banned word again
    const offers: Record<string, string> = { p19: "Kiln Again", p20: "Harbor Again", d2: "Apex Rise" };
    const model = new FakeModel((request) =>
      namingAnswer(request, (id) => {
        if (isRepairRequest(request)) return offers[id] ?? `${word(id)}x`;
        if (id === "d1") return "Apex Yards";
        if (id === "d2") return "Apex Rise";
        if (id === "p13") return "N-d0";
        if (!id.startsWith("p")) return `N-${id}`;
        return ["p0", "p1", "p2"].includes(id) ? `Kiln ${word(id)}` : `Harbor ${word(id)}`;
      }),
    );
    const named = await runNamingPass(world(), PARAMS, model);
    const byId = new Map(collect(named).map((e) => [e.id, e]));
    const holders = (prefix: string) => [...byId.values()].filter((e) => String(e.name).startsWith(prefix)).map((e) => e.id);

    expect(byId.get("d1")!.name).toBe("dbx");
    expect(byId.get("p13")!.name).toBe("pbdx");
    expect(holders("Kiln")).toEqual(["p0", "p1", "p2"]);
    expect(holders("Harbor")).toEqual(["p3", "p4", "p6", "p19", "p20"]);
    expect(byId.get("p19")!.name).toBe("Harbor pbj");
    expect(model.requests.filter(isRepairRequest).at(-1)!.user).toContain("harbor");

    // district names are final once the batches have been prompted with them
    expect(byId.get("d2")!.name).toBe("Apex Rise");
    expect(model.requests.filter((request) => isRepairRequest(request) && request.user.includes('"id":"d2"'))).toHaveLength(2);
    // a motif that uses a banned word never reaches a batch
    const batches = model.requests.filter((request) => !isDistrictRequest(request));
    expect(batches.some((request) => request.user.includes("the old ferry"))).toBe(true);
    expect(batches.some((request) => request.user.includes("tower lights"))).toBe(false);
  });

  it("asks for a missing charter again and reports a blank theme or model, an unnameable world and unrepairable names by code", async () => {
    let districtCalls = 0;
    const lateCharter = new FakeModel((request) =>
      isDistrictRequest(request) && ++districtCalls === 1 ? { names: {} } : wellBehaved(request),
    );
    await runNamingPass(world(), PARAMS, lateCharter);
    expect(districtCalls).toBe(2);

    const noCharter = new FakeModel((request) => (isDistrictRequest(request) ? { names: {} } : wellBehaved(request)));
    await expect(runNamingPass(world(), PARAMS, noCharter)).rejects.toMatchObject({ code: "COVERAGE_ERROR" });

    for (const params of [{ theme: " " }, { ...PARAMS, model: "  " }]) {
      await expect(runNamingPass(world(), params, new FakeModel())).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    }

    const empty = { meta: { seed: 1 }, districts: [], parcels: [] } as unknown as WorldState;
    await expect(runNamingPass(empty, PARAMS, new FakeModel()))
      .rejects.toMatchObject({ code: "INVALID_WORLD" });

    const colliding = new FakeModel((request) => namingAnswer(request, (id) => (id.startsWith("d") ? `N-${id}` : "Same Name")));
    await expect(runNamingPass(world(), PARAMS, colliding))
      .rejects.toMatchObject({ code: "COVERAGE_ERROR" });
  });
});
