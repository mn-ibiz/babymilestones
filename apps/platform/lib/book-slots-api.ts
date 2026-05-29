import type { BookableService, ServiceAvailability } from "@bm/contracts";

/** GET the active services the authed parent can browse + book (the `/book` list). */
export async function fetchBookableServices(): Promise<BookableService[]> {
  const res = await fetch("/parents/me/bookable-services", { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load services (${res.status})`);
  }
  return ((await res.json()) as { services: BookableService[] }).services;
}

/**
 * Parent slot-availability client (P2-E01-S02). Dependency-free so it unit-tests
 * without a DOM and never pulls server-only code into the Next bundle. Reads the
 * authed parent's view of a service's bookable slots for one of their children.
 */
export async function fetchAvailability(
  serviceId: string,
  childId: string,
): Promise<ServiceAvailability> {
  const res = await fetch(
    `/parents/me/services/${encodeURIComponent(serviceId)}/availability?childId=${encodeURIComponent(childId)}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load availability (${res.status})`);
  }
  return (await res.json()) as ServiceAvailability;
}
