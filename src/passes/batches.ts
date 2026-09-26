import type { Nameable } from "../types.js";
import { namespaceOf } from "../validate/coverage.js";

/** Parcel kinds by the topic they are named under: one batch mixes a topic's kinds, the way
 *  a street mixes a noodle bar and a hotel, and shares the topic's few-shot file. */
const PARCEL_TOPIC: Record<string, string> = {
  restaurant: "business",
  coffee_shop: "business",
  commerce: "business",
  hotel: "business",
  mall: "business",
  corpo: "corporate",
  offices: "corporate",
  factory: "corporate",
  police: "civic",
  hospital: "civic",
  clinic: "civic",
  military: "civic",
};

const TRANSIT_GROUPS = new Set(["train_station", "subway_station", "train_line", "subway_line", "bus_route"]);

/** Topic titles and, where the title alone is vague, what the topic covers. */
const TOPIC_LABEL: Record<string, [string, string?]> = {
  district: ["districts"],
  business: ["businesses", "shops, restaurants, coffee shops, hotels and malls"],
  corporate: ["corporations", "corporate headquarters, office buildings and industry"],
  civic: ["civic places", "police, hospitals, clinics and military sites"],
  generic: ["places of other kinds"],
};

/** Batches never cross a uniqueness namespace: all parcels share one and are split by topic,
 *  every other group is its own batch key. */
function topicOf(entity: Nameable): string {
  return namespaceOf(entity) === "parcel" ? (PARCEL_TOPIC[entity.group] ?? "generic") : entity.group;
}

/** Splits entities into batches of at most `size`, each within one topic, in worksheet order. */
export function batchesOf<T extends Nameable>(entities: T[], size: number): T[][] {
  const topics = new Map<string, T[]>();
  for (const entity of entities) {
    const key = topicOf(entity);
    const members = topics.get(key) ?? [];
    members.push(entity);
    topics.set(key, members);
  }
  const batches: T[][] = [];
  for (const members of topics.values()) {
    for (let i = 0; i < members.length; i += size) batches.push(members.slice(i, i + size));
  }
  return batches;
}

/** What a batch is, in short: "businesses", "subway stations". */
export function batchTitle(entity: Nameable): string {
  const topic = topicOf(entity);
  return TOPIC_LABEL[topic]?.[0] ?? `${topic.replace(/_/g, " ")}s`;
}

/** What a batch is, for the prompt: "businesses: shops, restaurants, ...". */
export function batchLabel(entity: Nameable): string {
  const detail = TOPIC_LABEL[topicOf(entity)]?.[1];
  return detail ? `${batchTitle(entity)}: ${detail}` : batchTitle(entity);
}

/** The few-shot file under prompts/ for a batch. */
export function fewshotFile(entity: Nameable): string {
  const topic = topicOf(entity);
  const file = topic === "district" ? "districts" : TRANSIT_GROUPS.has(topic) ? "transit" : topic in TOPIC_LABEL ? topic : "generic";
  return `fewshots/naming/${file}.md`;
}
