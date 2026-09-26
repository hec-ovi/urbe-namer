/** Closed error set of the naming box. Every failure surfaces as a NamingError with one of these codes. */

export type NamingErrorCode =
  | "INVALID_WORLD" // input world fails schema or contains no placeholders
  | "INVALID_PARAMS" // missing or empty theme, malformed ranges
  | "LLM_ERROR" // the model failed, or its answers could not be read and the repair rounds ran out
  | "COVERAGE_ERROR" // repair rounds exhausted: names missing, unsignable or duplicated; typing output malformed or ungrounded
  | "RANGE_ERROR" // typing pass: type counts outside [min, max] after repair
  | "AUTHOR_PENDING"; // an author dir holds no completion yet for the requests it names

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

/** The model answered, but the answer cannot be read as JSON. The passes treat it like an
 *  answer that named nothing, so their repair rounds ask again; it surfaces as LLM_ERROR only
 *  where no repair round is left to absorb it. */
export class UnreadableAnswer extends NamingError {
  constructor(message: string, detail?: unknown) {
    super("LLM_ERROR", message, detail);
    this.name = "UnreadableAnswer";
  }
}

/** A run stopped at requests an author has yet to answer. `requests` are the request files,
 *  every one the stage could write before it had to stop. */
export class AuthorPending extends NamingError {
  constructor(readonly dir: string, readonly requests: string[]) {
    super("AUTHOR_PENDING", `${requests.length} ${requests.length === 1 ? "request awaits its completion" : "requests await completions"} in ${dir}`, { requests });
    this.name = "AuthorPending";
  }

  /** One stop for every request a stage wrote, in key order. */
  static join(pending: AuthorPending[]): AuthorPending {
    return new AuthorPending(pending[0].dir, pending.flatMap((stop) => stop.requests).sort());
  }
}
