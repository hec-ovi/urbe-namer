import { NamingError } from "../errors.js";

/** Parses model output as JSON, tolerating a fenced code block around it. */
export function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    throw new NamingError("LLM_ERROR", "model output is not valid JSON", { text: text.slice(0, 500) });
  }
}
