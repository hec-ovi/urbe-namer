import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 as Ajv, type ValidateFunction } from "ajv/dist/2020.js";
import { NamingError, type NamingErrorCode } from "../errors.js";

const SCHEMA_DIR = new URL("../../schema/", import.meta.url);

/** Validates inputs and outputs against the JSON schemas in schema/. */
export class SchemaValidator {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly validators = new Map<string, ValidateFunction>();

  assert(schemaFile: string, value: unknown, code: NamingErrorCode, what: string): void {
    let validate = this.validators.get(schemaFile);
    if (!validate) {
      const path = fileURLToPath(new URL(schemaFile, SCHEMA_DIR));
      validate = this.ajv.compile(JSON.parse(readFileSync(path, "utf8")));
      this.validators.set(schemaFile, validate);
    }
    if (!validate(value)) {
      const errors = (validate.errors ?? [])
        .map((e) => `${e.instancePath || "/"} ${e.message}`)
        .join("; ");
      throw new NamingError(code, `${what} failed schema validation: ${errors}`, validate.errors);
    }
  }
}
