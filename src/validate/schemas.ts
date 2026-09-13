import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import type { RunParams } from "../types.js";
import { NamingError, type NamingErrorCode } from "../errors.js";

const SCHEMA_DIR = new URL("../../schema/", import.meta.url);

/** Validates inputs and outputs against the JSON schemas in schema/. */
export class SchemaValidator {
  private static readonly ajv = new Ajv({ allErrors: true, strict: false })
    .addFormat("date-time", { type: "string", validate: isIsoTimestamp });

  static {
    for (const schemaFile of readdirSync(SCHEMA_DIR).filter((file) => file.endsWith(".schema.json"))) {
      const path = fileURLToPath(new URL(schemaFile, SCHEMA_DIR));
      this.ajv.addSchema(JSON.parse(readFileSync(path, "utf8")), schemaFile);
    }
  }

  assert(schemaFile: string, value: unknown, code: NamingErrorCode, what: string): void {
    const validate = SchemaValidator.ajv.getSchema(schemaFile);
    if (!validate) throw new NamingError(code, `${what} schema is unavailable: ${schemaFile}`);
    if (!validate(value)) {
      const errors = (validate.errors ?? [])
        .map((e) => `${e.instancePath || "/"} ${e.message}`)
        .join("; ");
      throw new NamingError(code, `${what} failed schema validation: ${errors}`, validate.errors);
    }
  }

  params(params: RunParams): void {
    this.assert("params.schema.json", params, "INVALID_PARAMS", "params");
    if (params.theme.trim() === "") throw new NamingError("INVALID_PARAMS", "theme is required");
    for (const [category, range] of Object.entries(params.ranges ?? {})) {
      if (range.min > range.max) throw new NamingError("INVALID_PARAMS", `reversed range for ${category}`);
    }
  }

  options(options: { chunkSize?: number; maxRepairRounds?: number }): void {
    if (!options || typeof options !== "object") throw new NamingError("INVALID_PARAMS", "options must be an object");
    for (const [key, min] of [["chunkSize", 1], ["maxRepairRounds", 0]] as const) {
      const value = options[key];
      if (value !== undefined && (!Number.isInteger(value) || value < min)) {
        throw new NamingError("INVALID_PARAMS", `${key} must be an integer >= ${min}`);
      }
    }
  }
}

function isIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
