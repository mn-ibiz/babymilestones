import { describe, expect, it } from "vitest";
import { candidateRows, snippetRows, type AdminReviewSnippet, type ReviewSnippetCandidate } from "./review-snippets";

/**
 * P6-E04-S04 (Story 34.4) — admin review-snippets view-model. Pure shaping of the
 * curation-screen candidates (5-star comment + suggested anonymised attribution, AC1)
 * and the curated snippets with their publish state (AC2/AC3). No network here.
 */
describe("review-snippets admin view-model (P6-E04-S04)", () => {
  const candidates: ReviewSnippetCandidate[] = [
    {
      feedbackId: "f1",
      comment: "Magic place",
      rating: 5,
      submittedAt: "2026-06-10T10:00:00.000Z",
      suggestedAttribution: "Parent of two, Nairobi",
    },
  ];

  it("shapes candidate rows with the editable anonymised suggestion (AC1)", () => {
    const rows = candidateRows(candidates);
    expect(rows).toEqual([
      {
        feedbackId: "f1",
        comment: "Magic place",
        suggestedAttribution: "Parent of two, Nairobi",
        date: "2026-06-10",
      },
    ]);
  });

  it("the candidate suggestion never carries a real name (anonymised by construction)", () => {
    const rows = candidateRows(candidates);
    expect(rows[0]!.suggestedAttribution.startsWith("Parent")).toBe(true);
  });

  const snippets: AdminReviewSnippet[] = [
    {
      id: "s1",
      feedbackId: "f1",
      quote: "Magic place",
      attributionLabel: "Parent of two, Nairobi",
      published: true,
      publishedAt: "2026-06-11T09:00:00.000Z",
      displayOrder: 0,
      createdAt: "2026-06-11T08:00:00.000Z",
    },
    {
      id: "s2",
      feedbackId: "f2",
      quote: "Lovely",
      attributionLabel: "Parent of one, Mombasa",
      published: false,
      publishedAt: null,
      displayOrder: null,
      createdAt: "2026-06-11T08:30:00.000Z",
    },
  ];

  it("shapes snippet rows with a publish-state label (AC2/AC3)", () => {
    const rows = snippetRows(snippets);
    expect(rows[0]).toMatchObject({ id: "s1", published: true, statusLabel: "Published" });
    expect(rows[1]).toMatchObject({ id: "s2", published: false, statusLabel: "Draft" });
  });
});
