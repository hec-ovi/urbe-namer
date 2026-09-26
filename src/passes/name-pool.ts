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


/** Initials in a row that walk the alphabet before a list reads as generated. */
const ALPHABET_RUN = 5;

/** Ways a pool reads like a generator instead of a crowd: a list that walks the alphabet
 *  (Aria, Bex, Cora, Dina, Elara) and names no one can say (Glx, Qx). Quality problems:
 *  they earn a repair round, never a failure. */
export function poolProblems(pool: NamePool): string[] {
  const problems: string[] = [];
  const lists: [string, string[]][] = [...Object.entries(pool.givenByGender), ["family", pool.family]];
  for (const [list, names] of lists) {
    const run = alphabetRun(names);
    if (run.length >= ALPHABET_RUN) {
      problems.push(`pool: the ${list} names walk the alphabet (${run.join(", ")}); write names people here carry, in no particular order`);
    }
    const unsayable = names.filter((name) => !/[aeiouy]/i.test(fold(name)) || fold(name).replace(/[^a-z]/gi, "").length < 2);
    if (unsayable.length > 0) {
      problems.push(`pool: ${list} names no one can say: ${unsayable.join(", ")}; replace them with real names`);
    }
  }
  return problems;
}

/** The longest stretch of names whose initials step through the alphabet one letter at a time. */
function alphabetRun(names: string[]): string[] {
  let best: string[] = [];
  let run: string[] = [];
  let previous = -2;
  for (const name of names) {
    const initial = fold(name).toLowerCase().charCodeAt(0);
    if (initial === previous + 1) run.push(name);
    else run = [name];
    if (run.length > best.length) best = run;
    previous = initial;
  }
  return best;
}

function fold(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "");
}
