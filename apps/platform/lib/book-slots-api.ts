import type {
  BookablePlan,
  BookableService,
  BookingConfirmation,
  CoachingAvailability,
  CoachingBookingConfirmation,
  ParentBooking,
  SalonAvailability,
  SalonBookingConfirmation,
  ServiceAvailability,
} from "@bm/contracts";

/** GET the active subscription plans for a service (P2-E02-S02). */
export async function fetchServicePlans(serviceId: string): Promise<BookablePlan[]> {
  const res = await fetch(`/parents/me/services/${encodeURIComponent(serviceId)}/plans`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
  return ((await res.json()) as { plans: BookablePlan[] }).plans;
}

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

/** Subscribe a child to a plan (P2-E02-S02). Throws {@link BookingError} (e.g. 402 insufficient funds). */
export async function subscribeRequest(planId: string, childId: string): Promise<void> {
  await postBookingAction("/parents/me/subscriptions", { planId, childId });
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

/* --- Kids-Only Salon booking (P3-E03-S02 / Story 25.2) ------------------- */

/**
 * GET the salon availability for a service over the browse window (AC1/AC2). When
 * `staffId` is supplied only that stylist's open slots are returned; otherwise
 * every stylist's open slots are listed for the "Any available" flow.
 */
export async function fetchSalonAvailability(
  serviceId: string,
  staffId?: string,
): Promise<SalonAvailability> {
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : "";
  const res = await fetch(
    `/parents/me/salon/services/${encodeURIComponent(serviceId)}/availability${qs}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load salon availability (${res.status})`);
  }
  return (await res.json()) as SalonAvailability;
}

/**
 * Resolve the least-busy stylist for an "Any available" pick on a date (AC3).
 * Returns the stylist id whose open slot the client should then confirm.
 */
export async function fetchLeastBusyStylist(serviceId: string, date: string): Promise<string> {
  const res = await fetch(
    `/parents/me/salon/services/${encodeURIComponent(serviceId)}/least-busy?date=${encodeURIComponent(date)}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookingError(res.status, err.error ?? `Failed to resolve stylist (${res.status})`);
  }
  return ((await res.json()) as { staffId: string }).staffId;
}

/** POST a salon booking for a slot + child (AC4). Throws {@link BookingError} on a non-2xx. */
export async function bookSalonSlotRequest(
  salonSlotId: string,
  childId: string,
  staffId?: string,
): Promise<SalonBookingConfirmation> {
  const res = await fetch("/parents/me/salon/bookings", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ salonSlotId, childId, ...(staffId ? { staffId } : {}) }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookingError(res.status, err.error ?? `Salon booking failed (${res.status})`);
  }
  return (await res.json()) as SalonBookingConfirmation;
}

/* --- 1:1 Coaching booking (P5-E01-S02 / Story 31.2) ---------------------- */

/**
 * GET the coaching availability for an offering over the browse window (AC2). When
 * `staffId` is supplied only that coach's open slots are returned; otherwise every
 * coach's open slots are listed so the parent can pick a coach (required for a 1:1
 * session — there is no "Any available" fallback).
 */
export async function fetchCoachingAvailability(
  serviceId: string,
  staffId?: string,
): Promise<CoachingAvailability> {
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : "";
  const res = await fetch(
    `/parents/me/coaching/services/${encodeURIComponent(serviceId)}/availability${qs}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load coaching availability (${res.status})`);
  }
  return (await res.json()) as CoachingAvailability;
}

/** POST a 1:1 coaching booking for a slot + child + coach (AC3/AC4). Throws {@link BookingError} on a non-2xx. */
export async function bookCoachingSlotRequest(
  coachingSlotId: string,
  childId: string,
  staffId: string,
): Promise<CoachingBookingConfirmation> {
  const res = await fetch("/parents/me/coaching/bookings", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({ coachingSlotId, childId, staffId }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookingError(res.status, err.error ?? `Coaching booking failed (${res.status})`);
  }
  return (await res.json()) as CoachingBookingConfirmation;
}
