import type { BookableService, BookingConfirmation, ServiceAvailability } from "@bm/contracts";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/** A booking attempt failed for a reason the UI should show verbatim (e.g. "Slot just filled"). */
export class BookingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

/** POST a booking for a slot + child (P2-E01-S03). Throws {@link BookingError} on a non-2xx. */
export async function bookSlotRequest(
  slotId: string,
  childId: string,
): Promise<BookingConfirmation> {
  const res = await fetch("/parents/me/bookings", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ slotId, childId }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookingError(res.status, err.error ?? `Booking failed (${res.status})`);
  }
  return (await res.json()) as BookingConfirmation;
}

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
