/** Constrained-output JSON schemas built per call. ID-keyed objects with every id in
 *  `required` and `additionalProperties: false`: dropping or inventing an entity is a
 *  grammar violation, not a post-hoc detection (see docs/RESEARCH.md). */

const CATEGORIES = ["resident", "worker", "vendor", "authority", "transit", "street"];

function nameMapSchema(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(ids.map((id) => [id, { type: "string" }])),
    required: ids,
    additionalProperties: false,
  };
}

export function districtsOutputSchema(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { charter: { type: "string" }, names: nameMapSchema(ids) },
    required: ["charter", "names"],
    additionalProperties: false,
  };
}

export function chunkOutputSchema(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { names: nameMapSchema(ids) },
    required: ["names"],
    additionalProperties: false,
  };
}

export function typingOutputSchema(ground: {
  districtNames: Set<string>;
  parcelTypes: Set<string>;
  tiers: Set<string>;
}): Record<string, unknown> {
  const enumOr = (values: Set<string>) =>
    values.size > 0 ? { type: "array", items: { enum: [...values] } } : { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      types: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            label: { type: "string" },
            category: { enum: CATEGORIES },
            boilerplate: { type: "string" },
            examples: { type: "array", items: { type: "string" } },
            grounding: {
              type: "object",
              properties: {
                districts: enumOr(ground.districtNames),
                parcelTypes: enumOr(ground.parcelTypes),
                tiers: enumOr(ground.tiers),
              },
              required: [],
              additionalProperties: false,
            },
            weight: { type: "number" },
          },
          required: ["type", "label", "category", "boilerplate", "grounding", "weight"],
          additionalProperties: false,
        },
      },
      namePool: {
        type: "object",
        properties: {
          givenByGender: {
            type: "object",
            properties: {
              male: { type: "array", items: { type: "string" } },
              female: { type: "array", items: { type: "string" } },
              neutral: { type: "array", items: { type: "string" } },
            },
            required: ["male", "female", "neutral"],
            additionalProperties: false,
          },
          family: { type: "array", items: { type: "string" } },
        },
        required: ["givenByGender", "family"],
        additionalProperties: false,
      },
    },
    required: ["types", "namePool"],
    additionalProperties: false,
  };
}
