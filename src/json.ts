import { readFileSync, writeFileSync } from "node:fs";
import { NamingError, type NamingErrorCode } from "./errors.js";

export function readJson<T>(path: string, code: NamingErrorCode = "INVALID_WORLD"): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new NamingError(code, `cannot read JSON from ${path}`, error);
  }
}

export type JsonLayout = "compact" | "readable";

/** `readable` indents for a person; `compact` is one line, for documents too large to
 *  read by eye, where indentation costs five times the bytes and can pass the runtime's
 *  maximum string length before the world itself gets big. */
export function writeJsonFile(path: string, value: unknown, layout: JsonLayout = "readable"): void {
  try {
    writeFileSync(path, JSON.stringify(value, null, layout === "readable" ? 2 : 0) + "\n");
  } catch (error) {
    throw new NamingError("INVALID_WORLD", `cannot write JSON to ${path}`, error);
  }
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
