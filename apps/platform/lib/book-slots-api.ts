import type {
  BookableService,
  BookingConfirmation,
  ParentBooking,
  ServiceAvailability,
} from "@bm/contracts";

/** GET the authed parent's slot bookings (P2-E01-S07). */
export async function fetchParentBookings(): Promise<ParentBooking[]> {
  const res = await fetch("/parents/me/bookings", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`);
  return ((await res.json()) as { bookings: ParentBooking[] }).bookings;
}

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

async function postBookingAction(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookingError(res.status, err.error ?? `Request failed (${res.status})`);
  }
}

/** Cancel a booking (P2-E01-S06). Throws {@link BookingError} on a non-2xx (e.g. past cut-off). */
export async function cancelBookingRequest(bookingId: string): Promise<void> {
  await postBookingAction(`/parents/me/bookings/${encodeURIComponent(bookingId)}/cancel`);
}

/** Reschedule a booking to a new slot (P2-E01-S05). Throws {@link BookingError} on a non-2xx. */
export async function rescheduleBookingRequest(bookingId: string, newSlotId: string): Promise<void> {
  await postBookingAction(`/parents/me/bookings/${encodeURIComponent(bookingId)}/reschedule`, {
    newSlotId,
  });
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
