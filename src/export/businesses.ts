import type { Business, NamedWorld } from "../types.js";
import { asArray } from "../json.js";
import { SchemaValidator } from "../validate/schemas.js";
import { NamedWorldValidator } from "../validate/named-world.js";

/** The parcel types that advertise on screens: the materials rebrand lane's businessKind set. */
const ADVERTISING_TYPES = new Set(["hotel", "commerce", "mall", "restaurant", "coffee_shop", "corpo", "clinic"]);

const schemas = new SchemaValidator();
const namedWorlds: NamedWorldValidator = new NamedWorldValidator();

/** Projects a named world onto the materials rebrand request: one business per named
 *  parcel of an advertising type, in blueprint order. A world with none exports an empty list. */
export function exportBusinesses(world: NamedWorld): Business[] {
  namedWorlds.assert(world, "INVALID_WORLD");
  const businesses: Business[] = [];
  for (const parcel of asArray(world.parcels)) {
    if (typeof parcel.name !== "string" || !ADVERTISING_TYPES.has(String(parcel.type))) continue;
    businesses.push({ brandName: parcel.name, businessKind: String(parcel.type), tier: String(parcel.tier) });
  }
  schemas.assert("businesses.schema.json", businesses, "INVALID_WORLD", "businesses list");
  return businesses;
}
