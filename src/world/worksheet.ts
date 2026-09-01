import type { Nameable, WorldState } from "../types.js";
import { NamingError } from "../errors.js";
import { PlaceholderExtractor } from "./extractor.js";

/** Atlas transit collections that get names, with their naming group. Bus stops stay unnamed. */
const TRANSIT_GROUPS: Record<string, string> = {
  trainStations: "train_station",
  subwayStations: "subway_station",
  trainLines: "train_line",
  subwayLines: "subway_line",
  busRoutes: "bus_route",
};

/** Builds the flat worksheet of nameables from a world state.
 *  Pre-labeled states (any object carrying `id` + `placeholder`) are taken as-is via the
 *  generic walk. A bare atlas blueprint carries no placeholders, so nameables are selected
 *  by policy: every district, train/subway station and line, bus route, and every
 *  non-residential parcel; placeholder labels are derived per group in blueprint order. */
export class WorksheetBuilder {
  private readonly extractor = new PlaceholderExtractor();

  build(world: WorldState): Nameable[] {
    const explicit = this.extractor.extract(world);
    const nameables = explicit.length > 0 ? explicit : this.fromBlueprint(world);
    if (nameables.length === 0) {
      throw new NamingError("INVALID_WORLD", "world state exposes nothing nameable");
    }
    this.assertUniqueIds(nameables);
    return nameables;
  }

  private fromBlueprint(world: WorldState): Nameable[] {
    const nameables: Nameable[] = [];
    const counters = new Map<string, number>();
    const label = (group: string): string => {
      const n = (counters.get(group) ?? 0) + 1;
      counters.set(group, n);
      return `${group.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} ${n}`;
    };
    const add = (entity: Record<string, unknown>, collection: string, group: string): void => {
      if (typeof entity.id !== "string") return;
      const attrs: Record<string, string> = {};
      for (const key of ["kind", "type", "tier", "districtId"]) {
        if (typeof entity[key] === "string") attrs[key] = entity[key];
      }
      nameables.push({ id: entity.id, placeholder: label(group), collection, group, attrs });
    };

    for (const district of asArray(world.districts)) add(district, "district", "district");
    for (const parcel of asArray(world.parcels)) {
      if (parcel.type !== "residential") add(parcel, "parcel", String(parcel.type));
    }
    const transit = (world.transit ?? {}) as Record<string, unknown>;
    for (const [collection, group] of Object.entries(TRANSIT_GROUPS)) {
      for (const entity of asArray(transit[collection])) add(entity, collection, group);
    }
    return nameables;
  }

  private assertUniqueIds(nameables: Nameable[]): void {
    const seen = new Set<string>();
    for (const n of nameables) {
      if (seen.has(n.id)) {
        throw new NamingError("INVALID_WORLD", `duplicate nameable id in world state: ${n.id}`);
      }
      seen.add(n.id);
    }
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
