import type { NamedWorld, NamedWorldMeta, NameMap, WorldState } from "../types.js";

/** Applies a validated name map onto a copy of the world state: every object with
 *  `id` + `placeholder` gains `name`, the original state stays untouched. The copy and
 *  the patch are one pass, because a city-sized world is millions of nodes deep. */
export class NamePatcher {
  apply(world: WorldState, map: NameMap, meta: NamedWorldMeta): NamedWorld {
    const named = this.copy(world, map.names) as NamedWorld;
    named.meta = { ...named.meta, naming: meta };
    return named;
  }

  /** Deep-copies JSON structure, naming identified entities on the way through.
   *  Values that are not plain objects or arrays are copied by structuredClone. */
  private copy(node: object, names: Record<string, string>): object {
    if (Array.isArray(node)) {
      const out: unknown[] = new Array(node.length);
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        out[i] = item !== null && typeof item === "object" ? this.copy(item, names) : item;
      }
      return out;
    }
    if (!isPlainObject(node)) return structuredClone(node);

    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      const value = source[key];
      out[key] = value !== null && typeof value === "object" ? this.copy(value, names) : value;
    }
    if (typeof source.id === "string") {
      const name = names[source.id];
      if (name !== undefined) out.name = name;
    }
    return out;
  }
}

function isPlainObject(node: object): boolean {
  const proto = Object.getPrototypeOf(node);
  return proto === Object.prototype || proto === null;
}
