import type { Nameable, WorldState } from "../types.js";

const CONTEXT_ATTRS = ["type", "tier", "mode", "kind", "districtId"] as const;

/** Walks a world state generically and collects every object carrying `id` + `placeholder`.
 *  Schema-agnostic on purpose: any state that pre-labels its nameables works unchanged.
 *  Returns [] when the state carries no explicit placeholders (bare atlas blueprints do not;
 *  WorksheetBuilder then selects nameables by policy). */
export class PlaceholderExtractor {
  extract(world: WorldState): Nameable[] {
    const found: Nameable[] = [];
    this.walk(world, "root", found);
    return found;
  }

  private walk(node: unknown, collectionKey: string, found: Nameable[]): void {
    if (Array.isArray(node)) {
      for (const item of node) this.walk(item, collectionKey, found);
      return;
    }
    if (node === null || typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    if (typeof obj.id === "string" && typeof obj.placeholder === "string") {
      found.push(this.toNameable(obj, collectionKey));
    }
    for (const [key, value] of Object.entries(obj)) {
      this.walk(value, singular(key), found);
    }
  }

  private toNameable(obj: Record<string, unknown>, collection: string): Nameable {
    const attrs: Record<string, string> = {};
    for (const key of CONTEXT_ATTRS) {
      if (typeof obj[key] === "string") attrs[key] = obj[key];
    }
    const group = collection === "parcel" && attrs.type ? attrs.type : collection;
    return { id: obj.id as string, placeholder: obj.placeholder as string, collection, group, attrs };
  }
}

function singular(key: string): string {
  return key.endsWith("s") ? key.slice(0, -1) : key;
}
