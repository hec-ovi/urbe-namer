// Deterministic generator for fixtures/blueprint-large.json (seeded LCG, no deps).
// Atlas-shaped: district kinds, wealth tiers and parcel types from ../atlas/schema.
// Run once: node fixtures/make-large.mjs
import { writeFileSync } from "node:fs";

let s = 987654321;
const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const districtDefs = [
  ["downtown", "high_rich"], ["commercial", "rich"], ["industrial", "poor"],
  ["residential", "mid"], ["residential", "poor"], ["mixed", "mid"],
];
const businessTypes = ["restaurant", "coffee_shop", "commerce", "hotel", "offices", "corpo", "mall"];
const civicTypes = ["police", "hospital", "clinic", "military"];
const tiers = ["poor", "mid", "rich", "high_rich"];

const districts = districtDefs.map(([kind, tier], i) => ({
  id: `d${i}`, kind, tier, maxFloors: kind === "downtown" ? 40 : 12,
}));

const parcels = [];
let pid = 0;
for (const d of districts) {
  const n = 40 + Math.floor(rand() * 20);
  for (let i = 0; i < n; i++) {
    const roll = rand();
    const type =
      roll < 0.45 ? "residential" :
      roll < 0.52 ? "factory" :
      roll < 0.58 ? pick(civicTypes) : pick(businessTypes);
    const tier = pick(tiers.slice(0, tiers.indexOf(d.tier) + 1).concat(d.tier));
    parcels.push({ id: `p${pid++}`, districtId: d.id, type, tier });
  }
}

const transit = { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] };
let sid = 0;
for (const rail of ["train", "subway"]) {
  const level = rail === "subway" ? -12 : 0;
  for (let l = 0; l < 3; l++) {
    const stationIds = [];
    for (const d of districts) {
      if (rand() < 0.55) {
        const id = `${rail[0]}s${sid++}`;
        transit[`${rail}Stations`].push({ id, districtId: d.id, entrances: [], level });
        stationIds.push(id);
      }
    }
    if (stationIds.length > 0) {
      transit[`${rail}Lines`].push({
        id: `${rail[0]}l${l}`, stationIds, underground: rail === "subway", level,
      });
    }
  }
}
for (let r = 0; r < 4; r++) {
  const stopIds = districts.filter(() => rand() < 0.7).map((d, i) => {
    const id = `bs${r}_${i}`;
    transit.busStops.push({ id, edgeId: `e${r}${i}`, districtId: d.id });
    return id;
  });
  if (stopIds.length > 0) transit.busRoutes.push({ id: `br${r}`, stopIds, edgeIds: [] });
}

const parcelCounts = {};
for (const p of parcels) parcelCounts[p.type] = (parcelCounts[p.type] ?? 0) + 1;
const perDistrict = districts.map((d) => {
  const counts = {};
  let pop = 0;
  for (const p of parcels) {
    if (p.districtId !== d.id) continue;
    counts[p.type] = (counts[p.type] ?? 0) + 1;
    if (p.type === "residential") pop += 120 + Math.floor(rand() * 400);
  }
  return { districtId: d.id, population: pop, parcelCounts: counts };
});

const world = {
  meta: { version: "0.4.0", seed: "fixture-large", units: "meters" },
  districts,
  parcels,
  transit,
  stats: {
    population: perDistrict.reduce((sum, d) => sum + d.population, 0),
    parcelCounts,
    perDistrict,
  },
};

writeFileSync(new URL("blueprint-large.json", import.meta.url), JSON.stringify(world, null, 2) + "\n");
const nameable = parcels.filter((p) => p.type !== "residential").length +
  districts.length + transit.trainStations.length + transit.subwayStations.length +
  transit.trainLines.length + transit.subwayLines.length + transit.busRoutes.length;
console.log(`blueprint-large.json: ${districts.length} districts, ${parcels.length} parcels, ${nameable} nameables`);
