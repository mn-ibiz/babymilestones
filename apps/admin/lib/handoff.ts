import {
  handoffSummary,
  OBSERVATION_DEFAULT_MOOD,
  type ObservationMood,
} from "@bm/contracts";

/** Editable draft for the PickupHandoffScreen (P2-E03-S03 AC1). */
export interface HandoffDraft {
  mood: ObservationMood;
  activities: string[];
  note: string;
}

export function emptyHandoffDraft(): HandoffDraft {
  return { mood: OBSERVATION_DEFAULT_MOOD, activities: [], note: "" };
}

/** Toggle an activity chip on/off in the selection (AC1). */
export function toggleActivity(selected: string[], activity: string): string[] {
  return selected.includes(activity)
    ? selected.filter((a) => a !== activity)
    : [...selected, activity];
}

/** Build the hand-off request body from a draft (collapses an empty note). */
export function handoffBody(draft: HandoffDraft, bookingId: string): {
  bookingId: string;
  mood: string;
  activities: string[];
  note: string | null;
} {
  const note = draft.note.trim();
  return { bookingId, mood: draft.mood, activities: draft.activities, note: note === "" ? null : note };
}

/** Live one-line summary preview the attendant sees before confirming (AC2). */
export function summaryPreview(draft: HandoffDraft): string {
  return handoffSummary(draft.mood, draft.activities, draft.note.trim() === "" ? null : draft.note.trim());
}

/**
 * Whether the browser exposes the Web Speech API for the voice-to-text button
 * (AC3 — available on tablet). Pure check over the (optionally injected) global.
 */
export function isVoiceInputSupported(
  win: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | undefined = typeof window === "undefined"
    ? undefined
    : (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }),
): boolean {
  if (!win) return false;
  return Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition);
}
