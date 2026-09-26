import type { NamePool } from "../types.js";

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

/** Names in a row whose initials climb before a list reads as a walk through the alphabet. */
const WALK = 8;
/** The widest step up that still reads as the next letter or two of a walk. */
const WALK_STEP = 3;

/** Ways a pool reads like a generator instead of a crowd: a list that walks the alphabet
 *  (Bin, Case, Drew, Gin, Hay, Iris, Kit, Joi, Liv) and names no one can say (Glx, Qx).
 *  Quality problems: they earn a repair round, never a failure. */
export function poolProblems(pool: NamePool): string[] {
  const problems: string[] = [];
  const lists: [string, string[]][] = [...Object.entries(pool.givenByGender), ["family", pool.family]];
  for (const [list, names] of lists) {
    const walk = alphabetWalk(names);
    if (walk.length >= WALK) {
      problems.push(`pool: the ${list} names walk the alphabet (${walk.join(", ")}); write names people here carry, in no particular order`);
    }
    const unsayable = names.filter((name) => !sayable(name));
    if (unsayable.length > 0) {
      problems.push(`pool: ${list} names no one can say: ${unsayable.join(", ")}; replace them with real names`);
    }
  }
  return problems;
}

/** The longest stretch of names whose initials climb the alphabet a letter or a few at a
 *  time, forgiving one small step back (a swapped pair). */
function alphabetWalk(names: string[]): string[] {
  const initials = names.map((name) => letters(name).charCodeAt(0));
  let best: string[] = [];
  for (let start = 0; start < names.length; start++) {
    let end = start + 1;
    let stepsBack = 0;
    for (; end < names.length; end++) {
      const step = initials[end] - initials[end - 1];
      if (step >= 1 && step <= WALK_STEP) continue;
      if (step < 0 && step >= -WALK_STEP && stepsBack++ === 0) continue;
      break;
    }
    if (end - start > best.length) best = names.slice(start, end);
  }
  return best;
}

/** At least two letters and something to voice: a vowel, y or w, or a closing "ng"
 *  (Ng, the Cantonese surname). */
function sayable(name: string): boolean {
  const plain = letters(name);
  return plain.length >= 2 && (/[aeiouyw]/.test(plain) || plain.endsWith("ng"));
}

/** The name's letters, lowercased, accents folded. */
function letters(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
}
