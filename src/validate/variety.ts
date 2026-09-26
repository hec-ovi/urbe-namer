import type { Nameable } from "../types.js";
import { namespaceOf } from "./coverage.js";

/** Why a valid name still gets a second try. */
export type VarietyProblem = "banned" | "overused" | "echo";

export interface VarietyReport {
  /** entity id to its problem and the word behind it */
  flagged: Map<string, { problem: VarietyProblem; word: string }>;
  /** every banned or overused word and echoed name met, for the prompt that renames them */
  words: string[];
}

/** Glue words that say nothing about a name's character. */
const FUNCTION_WORDS = new Set(["the", "and", "for", "from", "with"]);

/** Every parcel shares one pool of names, the place where a model settles into one template
 *  ("Apex Vault", "Apex Spire", "Apex Prime"). Districts and transit may share a word by design:
 *  a ward ending, a line naming habit. */
export function pooled(entity: Nameable): boolean {
  return namespaceOf(entity) === "parcel";
}

/** Word-level variety across a city's names: words its charter bans, words so many names lean
 *  on that the city reads like one template, and parcels that copy a district or station name
 *  whole. All are quality checks: the repair rounds rename what they flag, and a name still
 *  flagged when the rounds run out stays. */
export class VarietyCheck {
  private readonly bans: Ban[];

  constructor(banned: string[]) {
    this.bans = banned.map(parseBan).filter((ban): ban is Ban => ban !== undefined);
  }

  check(worksheet: Nameable[], names: Record<string, string>): VarietyReport {
    const flagged: VarietyReport["flagged"] = new Map();
    const words = new Set<string>();
    const flag = (id: string, problem: VarietyProblem, word: string): void => {
      if (flagged.has(id)) return;
      flagged.set(id, { problem, word });
      words.add(word);
    };

    // a station may carry its district's name; a shop that does reads as a mistake
    const places = new Set(worksheet.filter((entity) => !pooled(entity) && names[entity.id]).map((entity) => names[entity.id].toLowerCase()));
    const holders = new Map<string, string[]>();
    let count = 0;
    for (const entity of worksheet) {
      const name = names[entity.id];
      if (name === undefined) continue;
      const banned = this.bannedWord(name);
      if (banned) flag(entity.id, "banned", banned);
      if (!pooled(entity)) continue;
      count++;
      if (places.has(name.toLowerCase())) flag(entity.id, "echo", name);
      for (const word of new Set(contentWords(name))) {
        const ids = holders.get(word) ?? [];
        ids.push(entity.id);
        holders.set(word, ids);
      }
    }

    const limit = overuseLimit(count);
    for (const [word, ids] of holders) {
      for (const id of ids.slice(limit)) flag(id, "overused", word);
    }
    return { flagged, words: [...words] };
  }

  /** The first ban the name breaks, as the word to avoid; undefined when it breaks none. */
  bannedWord(name: string): string | undefined {
    const tokens = letterWords(name);
    return this.bans.find((ban) => ban.matches(tokens))?.word;
  }
}

/** How many pooled names may share one word: three in a small city, one in twenty-five beyond. */
export function overuseLimit(count: number): number {
  return Math.max(3, Math.ceil(count / 25));
}

/** How many pooled names carry each word right now, so a rename can be judged before it lands. */
export class WordUsage {
  private readonly counts = new Map<string, number>();
  private readonly limit: number;

  constructor(worksheet: Nameable[], names: Record<string, string>) {
    let count = 0;
    for (const entity of worksheet) {
      const name = names[entity.id];
      if (!pooled(entity) || name === undefined) continue;
      count++;
      this.shift(name, 1);
    }
    this.limit = overuseLimit(count);
  }

  /** Whether trading `from` for `to` keeps every word `to` adds within the limit. */
  admits(from: string | undefined, to: string): boolean {
    const kept = new Set(from === undefined ? [] : contentWords(from));
    return [...new Set(contentWords(to))].every((word) => kept.has(word) || (this.counts.get(word) ?? 0) < this.limit);
  }

  trade(from: string | undefined, to: string): void {
    if (from !== undefined) this.shift(from, -1);
    this.shift(to, 1);
  }

  private shift(name: string, by: number): void {
    for (const word of new Set(contentWords(name))) this.counts.set(word, (this.counts.get(word) ?? 0) + by);
  }
}

/** The words that carry a name's character, lowercased and folded. */
export function contentWords(name: string): string[] {
  return letterWords(name).filter((word) => word.length >= 3 && !FUNCTION_WORDS.has(word));
}

function letterWords(name: string): string[] {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z]+/g) ?? [];
}

interface Ban {
  word: string;
  matches(tokens: string[]): boolean;
}

/** "-ville" bans a suffix, "neo-" a prefix, anything else a word or a phrase of words.
 *  Fragments shorter than three letters and bare glue words would ban half the city. */
function parseBan(entry: string): Ban | undefined {
  const text = entry.trim().toLowerCase();
  const fragment = letterWords(text).join("");
  if (text.startsWith("-") && fragment.length >= 3) {
    return { word: entry.trim(), matches: (tokens) => tokens.some((token) => token.endsWith(fragment)) };
  }
  if (text.endsWith("-") && fragment.length >= 3) {
    return { word: entry.trim(), matches: (tokens) => tokens.some((token) => token.startsWith(fragment)) };
  }
  const phrase = letterWords(text);
  if (phrase.length === 0 || (phrase.length === 1 && (phrase[0].length < 3 || FUNCTION_WORDS.has(phrase[0])))) return undefined;
  return {
    word: entry.trim(),
    matches: (tokens) => tokens.some((_, i) => phrase.every((word, j) => tokens[i + j] === word)),
  };
}
