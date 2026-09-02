import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NamingError } from "../errors.js";
import type { WorldState } from "../types.js";

/** Fixed file names: the engine's assembly carries `npc-types.json` found beside the
 *  blueprint it is given, so the outputs sit next to the input under names it knows. */
export const WORLD_FILES = {
  blueprint: "blueprint.json",
  named: "blueprint.named.json",
  npcTypes: "npc-types.json",
  businesses: "businesses.json",
} as const;

export type WorldFile = keyof typeof WORLD_FILES;

/** A world folder: `blueprint.json` in, the named world, NPC type set and businesses list out.
 *  `blueprint.json` is read only, so a rerun always starts from the same placeholders. */
export class WorldFolder {
  constructor(readonly dir: string) {}

  path(file: WorldFile): string {
    return join(this.dir, WORLD_FILES[file]);
  }

  readBlueprint(): WorldState {
    const path = this.path("blueprint");
    if (!existsSync(path)) {
      throw new NamingError("INVALID_WORLD", `no ${WORLD_FILES.blueprint} in ${this.dir}`);
    }
    return JSON.parse(readFileSync(path, "utf8")) as WorldState;
  }

  write(file: Exclude<WorldFile, "blueprint">, value: unknown): string {
    const path = this.path(file);
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
    return path;
  }
}
