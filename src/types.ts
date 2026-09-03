/** Shared types for the naming box. WorldState is the naming projection of the Atlas
 *  CityBlueprint: only fields naming reads are typed, and the rest pass through. */

export interface WorldState {
  meta: { seed: string | number; generator?: string; naming?: NamingMeta };
  [key: string]: unknown;
}

export interface NamingMeta {
  theme: string;
  model?: string;
  namedAt: string;
}

/** One placeholder entity, flattened for the LLM worksheet. */
export interface Nameable {
  id: string;
  placeholder: string;
  /** collection the entity came from: district, station, line, parcel, ... */
  collection: string;
  /** naming group: collection for most, parcel type for parcels (restaurant, police, ...) */
  group: string;
  /** context fields copied from the entity when present (type, tier, mode, kind, districtId) */
  attrs: Record<string, string>;
}

export interface NameMap {
  names: Record<string, string>;
}

/** One entry of the materials rebrand request: a named parcel of an advertising type. */
export interface Business {
  brandName: string;
  businessKind: string;
  tier: string;
}

export interface RunParams {
  theme: string;
  model?: string;
  ranges?: Record<string, { min: number; max: number }>;
}

export interface NpcType {
  type: string;
  label: string;
  category: string;
  boilerplate: string;
  examples?: string[];
  grounding: { districts?: string[]; parcelTypes?: string[]; tiers?: string[] };
  weight: number;
}

export type NameGender = "male" | "female" | "neutral";

/** Themed personal name pool; names repeat across NPCs by design. */
export interface NamePool {
  /** every given name, flat: the union of givenByGender in male, female, neutral order */
  given: string[];
  /** the same names tagged; each name sits in exactly one list, neutral holds names anyone carries */
  givenByGender: Record<NameGender, string[]>;
  family: string[];
}

export interface NpcTypeSet {
  meta: { theme: string; worldSeed: string | number; model?: string; createdAt: string };
  types: NpcType[];
  namePool: NamePool;
}
