import { NamingError, type NamingErrorCode } from "../errors.js";
import type { NamedWorld, Nameable, WorldState } from "../types.js";
import { WorksheetBuilder } from "../world/worksheet.js";
import { CoverageValidator } from "./coverage.js";
import { SchemaValidator } from "./schemas.js";

/** Enforces the structural schema and exact selected-name coverage of a named world. */
export class NamedWorldValidator {
  private readonly schemas = new SchemaValidator();
  private readonly coverage = new CoverageValidator();
  private readonly worksheets = new WorksheetBuilder();

  assert(
    world: WorldState,
    code: NamingErrorCode,
    worksheet?: Nameable[],
  ): asserts world is NamedWorld {
    this.schemas.assert("named-world.schema.json", world, code, "named world state");
    const report = this.coverage.checkWorld(worksheet ?? this.worksheets.build(world), world);
    if (!report.ok) throw new NamingError(code, "named world failed coverage validation", report);
  }
}
