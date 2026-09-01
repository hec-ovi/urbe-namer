/** Closed error set of the naming box. Every failure surfaces as a NamingError with one of these codes. */

export type NamingErrorCode =
  | "INVALID_WORLD" // input world fails schema or contains no placeholders
  | "INVALID_PARAMS" // missing or empty theme, malformed ranges
  | "LLM_ERROR" // provider failure after retries
  | "COVERAGE_ERROR" // repair loop exhausted: name map incomplete, invented ids, or duplicate names
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
