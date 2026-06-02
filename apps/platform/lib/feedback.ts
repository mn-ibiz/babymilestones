/**
 * Parent-dashboard pending-feedback prompt (P6-E04-S01 / Story 34.1).
 * Framework-agnostic + dependency-free so it unit-tests without a DOM. The
 * feedback-prompt island reads the authed parent's PENDING invitations and maps
 * them through here to the small view-model the prompt renders: a friendly title
 * per source type and the valid 0–5 star scale. A failed read fails quiet — the
 * prompt simply renders nothing (it never blocks a page).
 */

/** A pending feedback invitation as the API returns it. */
export interface PendingFeedbackItem {
  token: string;
  sourceType: string;
  invitedAt: string;
}

/** The valid star ratings (AC2): a one-tap 0–5 scale. */
export const FEEDBACK_STARS = [0, 1, 2, 3, 4, 5] as const;

/** The comment cap shared with the server (AC2). */
export const FEEDBACK_COMMENT_MAX = 200;

/** A human label for the touchpoint behind an invitation. */
export function feedbackPromptTitle(sourceType: string): string {
  switch (sourceType) {
    case "salon":
      return "How was your salon visit?";
    case "attendance":
      return "How was your visit?";
    case "order":
      return "How was your order?";
    case "coaching":
      return "How was your coaching session?";
    default:
      return "How did we do?";
  }
}

/** The single invitation the prompt should surface next, or null when none pend. */
export function nextPendingFeedback(
  items: PendingFeedbackItem[] | null | undefined,
): PendingFeedbackItem | null {
  if (!items || items.length === 0) return null;
  return items[0]!;
}

/** Whether a rating value is a valid one-tap 0–5 star (AC2). */
export function isValidStar(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 0 && rating <= 5;
}

/** Whether a comment is within the 200-char cap (AC2). Empty is allowed. */
export function isValidComment(comment: string): boolean {
  return comment.length <= FEEDBACK_COMMENT_MAX;
}
