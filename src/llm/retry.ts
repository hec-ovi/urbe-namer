import type { NamingError } from "../errors.js";

/** Attempts per provider call, including the first. */
const ATTEMPTS = 3;
/** First backoff; each further wait doubles it. */
const BASE_DELAY_MS = 200;
/** Ceiling for one wait, including a provider's own Retry-After. */
const MAX_DELAY_MS = 30_000;

/** A provider failure worth trying again: the connection dropped, the stream stopped
 *  mid-answer, or the server said it is busy. Carries the failure the caller sees when
 *  the attempts run out, and the wait the provider asked for when it named one. */
export class TransientFailure extends Error {
  constructor(
    readonly failure: NamingError,
    readonly retryAfterMs?: number,
  ) {
    super(failure.message);
    this.name = "TransientFailure";
  }
}

/** Runs one provider call, retrying transient failures with exponential backoff.
 *  Anything else, a refused request or a bad answer among it, is thrown straight through. */
export async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof TransientFailure)) throw error;
      if (attempt >= ATTEMPTS) throw error.failure;
      await sleep(waitFor(attempt, error.retryAfterMs));
    }
  }
}

/** Jittered so calls that failed together do not come back together. */
function waitFor(attempt: number, retryAfterMs?: number): number {
  const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
  const wait = retryAfterMs ?? backoff * (0.75 + Math.random() * 0.5);
  return Math.min(wait, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
