"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@bm/ui";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_STARS,
  feedbackPromptTitle,
  isValidComment,
  nextPendingFeedback,
  type PendingFeedbackItem,
} from "../../lib/feedback";
import { fetchPendingFeedback, submitFeedback } from "../../lib/feedback-api";

/**
 * Pending-feedback prompt island (P6-E04-S01 / Story 34.1). Mirrors the 22-1
 * outstanding-balance island: a single small client island in the parent shell
 * that reads the authed parent's PENDING feedback invitations and surfaces the
 * next one as a one-tap 0–5 prompt with an optional ≤200-char comment (AC2). On
 * submit it posts the rating (idempotent server-side, AC3) and refetches so the
 * answered touchpoint clears itself. A failed read fails quiet — the prompt stays
 * hidden, never blocking a page.
 */
export function FeedbackPromptIsland() {
  const [pending, setPending] = useState<PendingFeedbackItem[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    fetchPendingFeedback()
      .then(setPending)
      .catch(() => setPending([]));
  }, []);

  // Refetch on mount + navigation so a freshly-completed touchpoint appears and an
  // answered one disappears (mirrors the outstanding-balance island).
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const next = nextPendingFeedback(pending);
  if (!next) return null;

  async function rate(stars: number) {
    if (busy || !next) return;
    setBusy(true);
    try {
      await submitFeedback({ token: next.token, rating: stars, comment: comment.trim() || undefined });
      setComment("");
      refresh();
    } catch {
      // Fail quiet — a failed submit leaves the prompt in place to retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Rate your recent visit"
      className="mb-4 rounded-xl border border-ink/10 bg-surface p-4"
    >
      <p className="mb-3 text-sm font-medium text-ink">{feedbackPromptTitle(next.sourceType)}</p>
      <div className="mb-3 flex gap-2">
        {FEEDBACK_STARS.map((stars) => (
          <Button
            key={stars}
            type="button"
            variant="secondary"
            disabled={busy}
            aria-label={`Rate ${stars} out of 5`}
            onClick={() => rate(stars)}
          >
            {stars}
          </Button>
        ))}
      </div>
      <label className="block text-xs text-ink/60">
        Add a comment (optional)
        <textarea
          value={comment}
          maxLength={FEEDBACK_COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-ink/10 bg-surface p-2 text-sm text-ink"
          aria-invalid={!isValidComment(comment)}
        />
      </label>
    </section>
  );
}
