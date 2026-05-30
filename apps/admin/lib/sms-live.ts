/**
 * SMS live/stub switch helpers (P5-E03-S02). Pure logic for the admin toggle,
 * extracted so the client island stays declarative and the copy is unit-tested.
 */

/** Human label for the current switch state shown next to the toggle. */
export function liveStatusLabel(enabled: boolean): string {
  return enabled ? "Live — real SMS are being sent" : "Stub — messages are recorded, not sent";
}

/** Confirmation copy shown before flipping to live (irreversible-ish action). */
export function toggleConfirmMessage(next: boolean): string {
  return next
    ? "Enable live SMS? Real messages will be sent to recipients."
    : "Disable live SMS? Messages will be recorded but not sent.";
}
