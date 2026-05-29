import type {
  AttendanceBookingCard,
  AttendanceSlot,
  CheckInOutcome,
} from "@bm/contracts";

/** Short label for a slot row in the attendant list (AC1). */
export function slotLabel(slot: AttendanceSlot): string {
  return `${slot.startTime}–${slot.endTime} · ${slot.serviceName}`;
}

/** "2 / 5 checked in" progress summary for a slot (AC1). */
export function checkInProgress(slot: AttendanceSlot): string {
  return `${slot.checkedInCount} / ${slot.bookedCount} checked in`;
}

/** Whether a child card is still awaiting check-in (AC2/AC3). */
export function isAwaitingCheckIn(card: AttendanceBookingCard): boolean {
  return card.checkedInAt === null;
}

/**
 * Booking ids on a slot that can still be checked in — the candidates for a bulk
 * check-in (AC4). Already-checked-in cards are excluded.
 */
export function bulkCandidates(cards: AttendanceBookingCard[]): string[] {
  return cards.filter(isAwaitingCheckIn).map((c) => c.bookingId);
}

/** Human-facing message for a check-in outcome (AC3 — outstanding is a warning). */
export function outcomeMessage(outcome: CheckInOutcome): string {
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
