/** Maps a naming group to its themed few-shot topic file under prompts/fewshots/naming/. */

const TOPIC_BY_GROUP: Record<string, string> = {
  district: "districts",
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
  train_station: "transit",
  subway_station: "transit",
  train_line: "transit",
  subway_line: "transit",
  bus_route: "transit",
};

export function fewshotFile(group: string): string {
  return `fewshots/naming/${TOPIC_BY_GROUP[group] ?? "generic"}.md`;
}
