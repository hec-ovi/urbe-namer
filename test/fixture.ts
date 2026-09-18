/** The box's one test fixture: the small blueprint, the run params, a scripted model that
 *  plays along with each constrained output schema, and throwaway world folders. */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatModel, ChatRequest } from "../src/llm/model.js";
import type { PopulationStats } from "../src/passes/typing.js";
import type { NpcType, WorldState } from "../src/types.js";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PARAMS = { theme: "a rain-soaked dystopian megacity" };

/** A fresh copy of a fixture world, so a pass cannot leak state between cases. */
export function world(name = "blueprint-small.json"): WorldState {
  return JSON.parse(readFileSync(join(ROOT, "fixtures", name), "utf8")) as WorldState;
}

/** Demographics in the shape Simulation publishes. */
export const STATS: PopulationStats = {
  population: 5200,
  households: 2100,
  employed: 2600,
  unemployed: 700,
  perDistrict: [
    { districtId: "d1", population: 1800, households: 800, byTier: { poor: { population: 1800, employed: 900, unemployed: 400 } } },
  ],
};

export class FakeModel implements ChatModel {
  readonly id = "fake-model";
  readonly requests: ChatRequest[] = [];

  constructor(private readonly handler: (request: ChatRequest) => unknown = wellBehaved) {}

  async completeJSON(request: ChatRequest): Promise<unknown> {
    this.requests.push(request);
    return this.handler(request);
  }
}

/** A typing answer grounded in blueprint-small.json once the fake model has named it. */
export const GOOD_TYPES: NpcType[] = [
  {
    type: "tower_resident",
    label: "Tower resident",
    category: "resident",
    boilerplate: "Lives in the high stacks.",
    grounding: { districts: ["N-d0"], tiers: ["high_rich"] },
    weight: 0.5,
  },
  {
    type: "vat_worker",
    label: "Vat worker",
    category: "worker",
    boilerplate: "Works the fabrication lines.",
    examples: ["Okonkwo keeps a seedling by the lamp."],
    grounding: { districts: ["N-d1"], parcelTypes: ["factory"], tiers: ["poor"] },
    weight: 0.4,
  },
  {
    type: "counter_vendor",
    label: "Counter vendor",
    category: "vendor",
    boilerplate: "Runs a counter.",
    grounding: { parcelTypes: ["coffee_shop", "restaurant"] },
    weight: 0.3,
  },
  {
    type: "compliance_officer",
    label: "Compliance officer",
    category: "authority",
    boilerplate: "Patrols the rows.",
    grounding: { parcelTypes: ["police"] },
    weight: 0.2,
  },
];

export const POOL = {
  givenByGender: {
    male: Array.from({ length: 10 }, (_, i) => `Male${i}`),
    female: Array.from({ length: 10 }, (_, i) => `Female${i}`),
    neutral: Array.from({ length: 5 }, (_, i) => `Neutral${i}`),
  },
  family: Array.from({ length: 25 }, (_, i) => `Family${i}`),
};

/** Naming requests: names each required id "N-<id>", adds a charter when asked.
 *  Typing requests (the schema asks for `types`): the grounded set above. */
export function wellBehaved(request: ChatRequest): unknown {
  const properties = (request.schema?.properties ?? {}) as Record<string, unknown>;
  if ("types" in properties) return { types: GOOD_TYPES, namePool: POOL };
  const ids = requiredIds(request.schema);
  const names = Object.fromEntries(ids.map((id) => [id, `N-${id}`]));
  const wantsCharter = ((request.schema?.required as string[]) ?? []).includes("charter");
  return wantsCharter ? { charter: "Test charter", names } : { names };
}

export function requiredIds(schema: Record<string, unknown> | undefined): string[] {
  const properties = schema?.properties as Record<string, { required?: string[] }> | undefined;
  return properties?.names?.required ?? [];
}

/** Everything a case writes lands under .test-work/. */
export const WORKDIR = join(ROOT, ".test-work");
const created: string[] = [];

/** A throwaway directory, removed by removeFolders(). */
export function tempDir(prefix = "run-"): string {
  mkdirSync(WORKDIR, { recursive: true });
  const dir = mkdtempSync(join(WORKDIR, prefix));
  created.push(dir);
  return dir;
}

/** A throwaway world folder holding a copy of the fixture blueprint. */
export function folder(prefix = "world-"): string {
  const dir = tempDir(prefix);
  copyFileSync(join(ROOT, "fixtures/blueprint-small.json"), join(dir, "blueprint.json"));
  return dir;
}

export function removeFolders(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}
