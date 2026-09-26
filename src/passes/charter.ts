/** The naming charter: the style every naming batch of one world follows. The district call
 *  writes it; every later batch reads it as text, and the variety check enforces its bans. */
export interface Charter {
  /** peoples and languages the names come from, word shapes, what names lean on */
  voice: string;
  /** how each category and tier sounds */
  registers: string;
  /** recurring local references a name may draw on sparingly */
  motifs: string[];
  /** words and fragments no name may contain; "-ville" is a suffix, "neo-" a prefix */
  banned: string[];
}

/** Reads the charter out of a district reply; undefined when it has no usable voice.
 *  A provider that ignored the requested shape and wrote prose still counts as a voice. */
export function readCharter(raw: unknown): Charter | undefined {
  const value = (raw as { charter?: unknown } | null)?.charter;
  if (typeof value === "string") return value.trim() ? { voice: value.trim(), registers: "", motifs: [], banned: [] } : undefined;
  if (value === null || typeof value !== "object") return undefined;
  const fields = value as Record<string, unknown>;
  const voice = text(fields.voice);
  if (!voice) return undefined;
  return { voice, registers: text(fields.registers), motifs: list(fields.motifs), banned: list(fields.banned) };
}

/** Motifs one batch is offered. Batches run side by side without seeing each other, so each
 *  gets its own turn of the motif list, and no motif ends up in every batch. */
const MOTIFS_PER_BATCH = 4;

/** The charter as prompt text for the `batch`-th batch of a run. */
export function renderCharter(charter: Charter, batch: number): string {
  const lines = [`Voice: ${charter.voice}`];
  if (charter.registers) lines.push(`Registers: ${charter.registers}`);
  const motifs = turn(charter.motifs, batch);
  if (motifs.length > 0) lines.push(`Local motifs for this batch, each carried by one name at most: ${motifs.join("; ")}`);
  if (charter.banned.length > 0) lines.push(`Banned, never part of any name: ${charter.banned.join(", ")}`);
  return lines.join("\n");
}

function turn(motifs: string[], batch: number): string[] {
  if (motifs.length <= MOTIFS_PER_BATCH) return motifs;
  const start = (batch * MOTIFS_PER_BATCH) % motifs.length;
  return [...motifs, ...motifs].slice(start, start + MOTIFS_PER_BATCH);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item) => item !== "") : [];
}
