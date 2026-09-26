/** Informational progress: one human-readable line per finished step. Not a stable format. */
export type Progress = (line: string) => void;

/** Time since the call, formatted for a progress line. */
export function stopwatch(): () => string {
  const start = performance.now();
  return () => `${((performance.now() - start) / 1000).toFixed(1)}s`;
}
