import type { ObservationFeedItem } from "@bm/contracts";

/** Distinct services present in a feed, for the service-filter dropdown (AC2). */
export function serviceOptions(items: ObservationFeedItem[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const o of items) {
    if (o.serviceId && o.serviceName && !seen.has(o.serviceId)) seen.set(o.serviceId, o.serviceName);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

/** Human date label for a feed entry (AC1: date). */
export function observationDate(item: Pick<ObservationFeedItem, "date">): string {
  return item.date.slice(0, 10);
}

/** One-line activity + note summary for a timeline card. */
export function observationSummary(item: Pick<ObservationFeedItem, "activities" | "note">): string {
  const parts: string[] = [];
  if (item.activities.length > 0) parts.push(item.activities.join(", "));
  if (item.note) parts.push(item.note);
  return parts.join(" — ");
}
