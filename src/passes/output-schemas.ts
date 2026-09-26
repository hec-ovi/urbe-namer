/** Model response schemas; the passes validate received data independently. */

const CATEGORIES = ["resident", "worker", "vendor", "authority", "transit", "street"];

/** Each name comes after its origin: a few words on who or what the place is named after,
 *  written first so the name grows from something concrete. */
const NAME_ENTRY = {
  type: "object",
  properties: { origin: { type: "string" }, name: { type: "string" } },
  required: ["origin", "name"],
  additionalProperties: false,
};

function nameMapSchema(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(ids.map((id) => [id, NAME_ENTRY])),
    required: ids,
    additionalProperties: false,
  };
}

const TEXT_LIST = { type: "array", items: { type: "string" } };

export function districtsOutputSchema(ids: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      charter: {
        type: "object",
        properties: { voice: { type: "string" }, registers: { type: "string" }, motifs: TEXT_LIST, banned: TEXT_LIST },
        required: ["voice", "registers", "motifs", "banned"],
        additionalProperties: false,
      },
      names: nameMapSchema(ids),
    },
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
          // written first: the real naming traditions the pool draws on
          cultures: { type: "string" },
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
        required: ["cultures", "givenByGender", "family"],
        additionalProperties: false,
      },
    },
    required: ["types", "namePool"],
    additionalProperties: false,
  };
}
