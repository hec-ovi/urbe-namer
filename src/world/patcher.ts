import type { NamedWorld, NamedWorldMeta, NameMap, WorldState } from "../types.js";

/** Applies a validated name map onto a copy of the world state: every object with
 *  `id` + `placeholder` gains `name`, the original state stays untouched. */
export class NamePatcher {
  apply(world: WorldState, map: NameMap, meta: NamedWorldMeta): NamedWorld {
    const named = structuredClone(world);
    this.patch(named, map.names);
    named.meta = { ...named.meta, naming: meta };
    return named as NamedWorld;
  }

  private patch(node: unknown, names: Record<string, string>): void {
    if (Array.isArray(node)) {
      for (const item of node) this.patch(item, names);
      return;
    }
    if (node === null || typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    if (typeof obj.id === "string" && names[obj.id] !== undefined) {
      obj.name = names[obj.id];
    }
    for (const value of Object.values(obj)) this.patch(value, names);
  }
}
