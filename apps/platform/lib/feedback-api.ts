import type { PendingFeedbackItem } from "./feedback";

/**
 * Parent feedback client (P6-E04-S01 / Story 34.1). Dependency-free so it
 * unit-tests without a DOM and never pulls server-only code into the Next bundle.
 * Reads the authed parent's PENDING invitations and submits a one-tap 0–5 rating
 * + optional ≤200-char comment. The submit is idempotent server-side (AC3).
 */

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/** GET the authed parent's pending feedback invitations (AC2). */
export async function fetchPendingFeedback(): Promise<PendingFeedbackItem[]> {
  const res = await fetch("/parents/me/feedback", { credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to load feedback (${res.status})`);
  }
  return ((await res.json()) as { pending: PendingFeedbackItem[] }).pending;
}

export interface SubmitFeedbackResult {
  token: string;
  rating: number | null;
  comment: string | null;
  submittedAt: string | null;
}

/** POST a one-tap 0–5 rating + optional comment for an invitation token (AC2/AC3). */
export async function submitFeedback(input: {
  token: string;
  rating: number;
  comment?: string;
}): Promise<SubmitFeedbackResult> {
  const res = await fetch("/parents/me/feedback/submit", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
    body: JSON.stringify({
      token: input.token,
      rating: input.rating,
      comment: input.comment ?? null,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Failed to submit feedback (${res.status})`);
  }
  return (await res.json()) as SubmitFeedbackResult;
}
