import type { NamePool } from "../types.js";

export function emptyPool(): NamePool {
  return { given: [], givenByGender: { male: [], female: [], neutral: [] }, family: [] };
}

/** What the model owns: the flat `given` list is derived here, so it never comes back edited. */
export function modelSide(pool: NamePool): Pick<NamePool, "givenByGender" | "family"> {
  return { givenByGender: pool.givenByGender, family: pool.family };
}

/** Trims, drops empties and dedupes case-insensitively; deterministic harness-side cleanup.
 *  Given names dedupe across the three gender lists, so a name lands in exactly one, and the
 *  flat `given` list is their union: the tags and the flat list can never drift apart. */
export function extractPool(raw: unknown): NamePool {
  const container = ((raw ?? {}) as Record<string, unknown>).namePool as Record<string, unknown> | undefined;
  const tagged = (container?.givenByGender ?? {}) as Record<string, unknown>;
  const givenSeen = new Set<string>();
  const givenByGender = {
    male: clean(tagged.male, givenSeen),
    female: clean(tagged.female, givenSeen),
    neutral: clean(tagged.neutral, givenSeen),
  };
  return {
    given: [...givenByGender.male, ...givenByGender.female, ...givenByGender.neutral],
    givenByGender,
    family: clean(container?.family, new Set()),
  };
}

function clean(value: unknown, seen: Set<string>): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    const key = name.toLowerCase();
    if (name === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

