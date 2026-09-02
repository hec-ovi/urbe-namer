import type { ChatModel, ChatRequest } from "../src/llm/model.js";
import type { NpcType } from "../src/types.js";

/** Scripted ChatModel: tests inject a handler; the default plays along with the
 *  constrained output schema, naming every required id uniquely and answering a
 *  typing request with a grounded type set. */
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

export const FAMILY = Array.from({ length: 25 }, (_, i) => `Family${i}`);

export const POOL = {
  givenByGender: {
    male: Array.from({ length: 10 }, (_, i) => `Male${i}`),
    female: Array.from({ length: 10 }, (_, i) => `Female${i}`),
    neutral: Array.from({ length: 5 }, (_, i) => `Neutral${i}`),
  },
  family: FAMILY,
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
