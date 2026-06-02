import type { SalonCounterBoard, SalonCounterBooking } from "@bm/contracts";

/**
 * Pure view-model helpers for the salon counter screen (P3-E03-S03 / Story 25.3).
 * The board grouping itself lives in `@bm/contracts`
 * (`groupSalonBookingsByStylistAndHour`); these helpers shape the per-booking
 * lifecycle for the reception UI.
 */

/** The booking's lifecycle state — drives which action button is shown. */
export type SalonBookingState = "awaiting_checkin" | "in_service" | "completed";

/** Resolve a booking's lifecycle state (AC2/AC3). */
export function salonBookingState(b: SalonCounterBooking): SalonBookingState {
  if (b.completedAt) return "completed";
  if (b.checkedInAt) return "in_service";
  return "awaiting_checkin";
}

/** A short `HH:MM–HH:MM · Child` row label for the board. */
export function salonBookingLabel(b: SalonCounterBooking): string {
  return `${b.startTime}–${b.endTime} · ${b.childName}`;
}

/** Whether the completion screen may offer a photo capture (consent-gated, AC3). */
export function canCapturePhoto(b: SalonCounterBooking): boolean {
  return b.photoConsent === true;
}

/** Human label for a booking's current state. */
export function salonStateLabel(b: SalonCounterBooking): string {
  switch (salonBookingState(b)) {
    case "completed":
      return "✓ completed";
    case "in_service":
      return "in service";
    default:
      return "awaiting check-in";
  }
}

/** Human-facing message for a check-in outcome (AC2 — outstanding is a warning). */
export function salonCheckInMessage(outcome: string): string {
  switch (outcome) {
    case "settled":
      return "Checked in — wallet charged.";
    case "settled_on_credit":
      return "Checked in — charged on auto-credit (balance went negative).";
    case "covered":
      return "Checked in — covered by subscription.";
    case "outstanding":
      return "Checked in — wallet was short, an outstanding balance was created.";
    default:
      return "Checked in.";
  }
}

/* --- Reassign a salon booking between stylists (P3-E03-S04 / Story 25.4) - */

/** A stylist the booking can be reassigned to. */
export interface SalonReassignTarget {
  staffId: string;
  staffName: string;
}

/**
 * Whether a booking may still be reassigned (Story 25.4 AC1). A completed service
 * is locked — only an awaiting-check-in or in-service booking can be moved.
 */
export function canReassign(b: SalonCounterBooking): boolean {
  return salonBookingState(b) !== "completed";
}

/**
 * The reassign-target options for a booking: every OTHER stylist currently on the
 * board (Story 25.4 AC1), excluding the booking's current stylist. The server is
 * the source of truth for slot availability and rejects a target with no open
 * slot — this just shapes the select control. Order follows the board.
 */
export function reassignTargetOptions(
  board: SalonCounterBoard,
  b: SalonCounterBooking,
): SalonReassignTarget[] {
  return board.stylists
    .filter((s) => s.staffId !== b.staffId)
    .map((s) => ({ staffId: s.staffId, staffName: s.staffName }));
}

/** Human-facing message after a reassign (Story 25.4) — flags a commission move. */
export function salonReassignMessage(commissionMoved: boolean): string {
  return commissionMoved
    ? "Reassigned — commission moved to the new stylist."
    : "Reassigned to the new stylist.";
}
