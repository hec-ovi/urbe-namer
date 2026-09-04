import type { Nameable, WorldState } from "../types.js";
import { spellsOnSign } from "./sign.js";

/** Uniqueness namespace: all parcels share one (a hotel and a mall must not collide);
 *  districts and each transit kind keep their own, so an interchange may reuse a
 *  station name across modes. */
export function namespaceOf(entity: Nameable): string {
  return entity.collection === "parcel" ? "parcel" : entity.group;
}

export interface CoverageReport {
  ok: boolean;
  /** worksheet ids the map did not name */
  missing: string[];
  /** map ids that do not exist in the worksheet */
  invented: string[];
  /** ids whose name is empty or whitespace */
  empty: string[];
  /** ids whose name does not spell in the sign alphabet or runs past its length */
  unsignable: string[];
  /** ids whose name collides with another name in the same namespace (case-insensitive) */
  duplicated: string[];
}

/** Checks a name map against the worksheet: exact cover, nothing invented, every name
 *  signable, names unique within their namespace. Feeds the repair loop. */
export class CoverageValidator {
  check(worksheet: Nameable[], names: Record<string, string>): CoverageReport {
    const byId = new Map(worksheet.map((n) => [n.id, n]));

    const missing: string[] = [];
    const invented: string[] = [];
    const empty: string[] = [];
    const unsignable: string[] = [];
    const duplicated: string[] = [];

    for (const id of Object.keys(names)) {
      if (!byId.has(id)) invented.push(id);
    }

    const groupNames = new Map<string, Map<string, string[]>>();
    for (const entity of worksheet) {
      const name = names[entity.id];
      if (name === undefined) {
        missing.push(entity.id);
        continue;
      }
      if (name.trim() === "") {
        empty.push(entity.id);
        continue;
      }
      if (!spellsOnSign(name)) {
        unsignable.push(entity.id);
        continue;
      }
      const key = name.trim().toLowerCase();
      const namespace = namespaceOf(entity);
      let perGroup = groupNames.get(namespace);
      if (!perGroup) groupNames.set(namespace, (perGroup = new Map()));
      const holders = perGroup.get(key) ?? [];
      holders.push(entity.id);
      perGroup.set(key, holders);
    }

    for (const perGroup of groupNames.values()) {
      for (const holders of perGroup.values()) {
        if (holders.length > 1) duplicated.push(...holders.slice(1));
      }
    }

    const ok = missing.length + invented.length + empty.length + unsignable.length + duplicated.length === 0;
    return { ok, missing, invented, empty, unsignable, duplicated };
  }

  /** Checks the names actually present on the returned world, after patching. */
  checkWorld(worksheet: Nameable[], world: WorldState): CoverageReport {
    const wanted = new Set(worksheet.map((entity) => entity.id));
    const names: Record<string, string> = {};
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (node === null || typeof node !== "object") return;
      const value = node as Record<string, unknown>;
      if (typeof value.id === "string" && wanted.has(value.id) && typeof value.name === "string") {
        names[value.id] = value.name;
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(world);
    return this.check(worksheet, names);
  }
}
