/** Closed error set of the naming box. Every failure surfaces as a NamingError with one of these codes. */

export type NamingErrorCode =
  | "INVALID_WORLD" // input world fails schema or contains no placeholders
  | "INVALID_PARAMS" // missing or empty theme, malformed ranges
  | "LLM_ERROR" // provider failure after retries, or unreadable answers the repair rounds could not replace
  | "COVERAGE_ERROR" // repair rounds exhausted: names missing, unsignable or duplicated; typing output malformed or ungrounded
  | "RANGE_ERROR"; // typing pass: type counts outside [min, max] after repair

export class NamingError extends Error {
  constructor(
    public readonly code: NamingErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "NamingError";
  }
}

/** The provider answered, but the answer cannot be read: not JSON, or cut at a length limit.
 *  The passes treat it like an answer that named nothing, so their repair rounds ask again;
 *  it surfaces as LLM_ERROR only where no repair round is left to absorb it. */
export class UnreadableAnswer extends NamingError {
  constructor(message: string, detail?: unknown) {
    super("LLM_ERROR", message, detail);
    this.name = "UnreadableAnswer";
  }
}
