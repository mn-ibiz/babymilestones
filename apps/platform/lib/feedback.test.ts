import { describe, expect, it } from "vitest";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_STARS,
  feedbackPromptTitle,
  isValidComment,
  isValidStar,
  nextPendingFeedback,
  type PendingFeedbackItem,
} from "./feedback";

function item(partial: Partial<PendingFeedbackItem> = {}): PendingFeedbackItem {
  return { token: "tok-1", sourceType: "salon", invitedAt: "2026-06-15T10:00:00.000Z", ...partial };
}

/**
 * P6-E04-S01 (Story 34.1) — parent feedback-prompt view-model. The island maps
 * the authed parent's pending invitations through here to a friendly title + the
 * one-tap 0–5 scale, and validates a submission (rating 0..5, comment ≤200).
 */
describe("feedback prompt view-model (P6-E04-S01 / Story 34.1)", () => {
  it("AC2: the star scale is exactly 0..5", () => {
    expect([...FEEDBACK_STARS]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("surfaces the most recent pending invitation, or null when none pend", () => {
    expect(nextPendingFeedback(null)).toBeNull();
    expect(nextPendingFeedback([])).toBeNull();
    const next = nextPendingFeedback([item({ token: "a" }), item({ token: "b" })]);
    expect(next!.token).toBe("a");
  });

  it("maps each source type to a friendly prompt title", () => {
    expect(feedbackPromptTitle("salon")).toMatch(/salon/i);
    expect(feedbackPromptTitle("order")).toMatch(/order/i);
    expect(feedbackPromptTitle("coaching")).toMatch(/coaching/i);
    expect(feedbackPromptTitle("attendance")).toMatch(/visit/i);
    expect(feedbackPromptTitle("unknown-kind")).toBe("How did we do?");
  });

  it("AC2: validates a 0..5 star rating", () => {
    for (const s of [0, 1, 2, 3, 4, 5]) expect(isValidStar(s)).toBe(true);
    expect(isValidStar(-1)).toBe(false);
    expect(isValidStar(6)).toBe(false);
    expect(isValidStar(2.5)).toBe(false);
  });

  it("AC2: validates the 200-char comment cap (empty allowed)", () => {
    expect(isValidComment("")).toBe(true);
    expect(isValidComment("x".repeat(FEEDBACK_COMMENT_MAX))).toBe(true);
    expect(isValidComment("x".repeat(FEEDBACK_COMMENT_MAX + 1))).toBe(false);
  });
});
