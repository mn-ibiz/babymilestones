import type { ObservationFeedFilter, ObservationFeedItem } from "@bm/contracts";

/** GET a child's observations timeline (P2-E03-S04), optionally filtered (AC2). */
export async function fetchObservations(
  childId: string,
  filter: ObservationFeedFilter = {},
): Promise<ObservationFeedItem[]> {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.serviceId) params.set("serviceId", filter.serviceId);
  const qs = params.toString();
  const res = await fetch(
    `/parents/me/children/${encodeURIComponent(childId)}/observations${qs ? `?${qs}` : ""}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to load observations (${res.status})`);
  return ((await res.json()) as { observations: ObservationFeedItem[] }).observations;
}
