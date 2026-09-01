import type { Nameable } from "../types.js";

export interface CoverageReport {
  ok: boolean;
  /** worksheet ids the map did not name */
  missing: string[];
  /** map ids that do not exist in the worksheet */
  invented: string[];
  /** ids whose name is empty or whitespace */
  empty: string[];
  /** ids whose name collides with another name in the same group (case-insensitive) */
  duplicated: string[];
}

/** Checks a name map against the worksheet: exact cover, nothing invented,
 *  names unique within their group. Feeds the repair loop. */
export class CoverageValidator {
  check(worksheet: Nameable[], names: Record<string, string>): CoverageReport {
    const byId = new Map(worksheet.map((n) => [n.id, n]));

    const missing: string[] = [];
    const invented: string[] = [];
    const empty: string[] = [];
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
      const key = name.trim().toLowerCase();
      let perGroup = groupNames.get(entity.group);
      if (!perGroup) groupNames.set(entity.group, (perGroup = new Map()));
      const holders = perGroup.get(key) ?? [];
      holders.push(entity.id);
      perGroup.set(key, holders);
    }

    for (const perGroup of groupNames.values()) {
      for (const holders of perGroup.values()) {
        if (holders.length > 1) duplicated.push(...holders.slice(1));
      }
    }

    const ok = missing.length + invented.length + empty.length + duplicated.length === 0;
    return { ok, missing, invented, empty, duplicated };
  }
}
