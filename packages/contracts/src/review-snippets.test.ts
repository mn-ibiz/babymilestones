import { describe, expect, it } from "vitest";
import {
  curateReviewSnippetSchema,
  updateReviewAttributionSchema,
  reorderReviewSnippetsSchema,
  reviewSnippetCards,
  REVIEW_QUOTE_MAX,
  REVIEW_ATTRIBUTION_MAX,
  type PublicReviewSnippetDto,
} from "./index.js";

/**
 * P6-E04-S04 (Story 34.4) — public review snippet contracts. The curate/edit/reorder
 * input schemas and the home-page testimonial-card view-model. The public DTO carries
 * ONLY quote + attribution (AC2) — never a parent identity.
 */
describe("review snippet contracts (P6-E04-S04 / Story 34.4)", () => {
  describe("curateReviewSnippetSchema (AC1)", () => {
    it("accepts a bare feedbackId (quote + attribution default server-side)", () => {
      const parsed = curateReviewSnippetSchema.safeParse({
        feedbackId: "11111111-1111-1111-1111-111111111111",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts an explicit quote + attribution override", () => {
      const parsed = curateReviewSnippetSchema.safeParse({
        feedbackId: "11111111-1111-1111-1111-111111111111",
        quote: "Wonderful",
        attributionLabel: "A happy parent, Kenya",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects a non-uuid feedbackId", () => {
      expect(curateReviewSnippetSchema.safeParse({ feedbackId: "nope" }).success).toBe(false);
    });

    it("rejects an over-long quote", () => {
      const parsed = curateReviewSnippetSchema.safeParse({
        feedbackId: "11111111-1111-1111-1111-111111111111",
        quote: "x".repeat(REVIEW_QUOTE_MAX + 1),
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an over-long attribution", () => {
      const parsed = curateReviewSnippetSchema.safeParse({
        feedbackId: "11111111-1111-1111-1111-111111111111",
        attributionLabel: "x".repeat(REVIEW_ATTRIBUTION_MAX + 1),
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("updateReviewAttributionSchema (AC1)", () => {
    it("accepts a non-empty label", () => {
      expect(updateReviewAttributionSchema.safeParse({ attributionLabel: "Parent of two, Nairobi" }).success).toBe(true);
    });
    it("rejects an empty label", () => {
      expect(updateReviewAttributionSchema.safeParse({ attributionLabel: "  " }).success).toBe(false);
    });
  });

  describe("reorderReviewSnippetsSchema", () => {
    it("accepts a non-empty list of uuids", () => {
      expect(
        reorderReviewSnippetsSchema.safeParse({ orderedIds: ["11111111-1111-1111-1111-111111111111"] }).success,
      ).toBe(true);
    });
    it("rejects an empty list", () => {
      expect(reorderReviewSnippetsSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    });
  });

  describe("reviewSnippetCards (AC2)", () => {
    const dtos: PublicReviewSnippetDto[] = [
      { id: "a", quote: " Magic ", attributionLabel: " Parent of two, Nairobi " },
      { id: "b", quote: "", attributionLabel: "Parent, Mombasa" },
      { id: "c", quote: "Lovely", attributionLabel: "  " },
    ];

    it("maps the public DTO to render-ready cards, trimming whitespace", () => {
      const cards = reviewSnippetCards([dtos[0]!]);
      expect(cards).toEqual([{ id: "a", quote: "Magic", attribution: "Parent of two, Nairobi" }]);
    });

    it("drops snippets with an empty quote or attribution defensively", () => {
      const cards = reviewSnippetCards(dtos);
      expect(cards.map((c) => c.id)).toEqual(["a"]);
    });

    it("never carries a parent identity (the DTO has none to begin with)", () => {
      const cards = reviewSnippetCards([dtos[0]!]);
      const keys = Object.keys(cards[0]!).sort();
      expect(keys).toEqual(["attribution", "id", "quote"]);
    });
  });
});
