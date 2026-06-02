import { apiFetch } from "./api";
import type {
  AdminReviewSnippetDto,
  AdminReviewSnippetsResponse,
  ReviewSnippetCandidateDto,
} from "@bm/contracts";

/**
 * Admin review-snippets client logic (P6-E04-S04 / Story 34.4). The `/review-snippets`
 * admin page reads the admin-gated `/admin/review-snippets` API (credentialed —
 * session cookie + CSRF) to list the 5-star candidates + curated snippets, curate one
 * (defaulting an ANONYMISED attribution from real data, AC1), edit that attribution,
 * and PUBLISH / UNPUBLISH it (audited server-side, AC3). Framework-free so it
 * unit-tests without React.
 */

export type ReviewSnippetCandidate = ReviewSnippetCandidateDto;
export type AdminReviewSnippet = AdminReviewSnippetDto;
export type ReviewSnippetsState = AdminReviewSnippetsResponse;

/** Load the curation screen: 5-star candidates + already-curated snippets. */
export function fetchReviewSnippets(): Promise<ReviewSnippetsState> {
  return apiFetch<ReviewSnippetsState>("/admin/review-snippets");
}

/** Curate a 5-star feedback into a snippet (optional quote / attribution override). */
export function curateSnippet(input: {
  feedbackId: string;
  quote?: string;
  attributionLabel?: string;
}): Promise<{ snippet: AdminReviewSnippet }> {
  return apiFetch<{ snippet: AdminReviewSnippet }>("/admin/review-snippets", { method: "POST", body: input });
}

/** Edit a snippet's anonymised attribution label (AC1 privacy guarantee). */
export function editAttribution(id: string, attributionLabel: string): Promise<{ snippet: AdminReviewSnippet }> {
  return apiFetch<{ snippet: AdminReviewSnippet }>(`/admin/review-snippets/${id}/attribution`, {
    method: "POST",
    body: { attributionLabel },
  });
}

/** Publish a snippet to the public home page (audited, AC3). */
export function publishSnippet(id: string): Promise<{ snippet: AdminReviewSnippet }> {
  return apiFetch<{ snippet: AdminReviewSnippet }>(`/admin/review-snippets/${id}/publish`, { method: "POST", body: {} });
}

/** Unpublish a snippet (audited, AC3). */
export function unpublishSnippet(id: string): Promise<{ snippet: AdminReviewSnippet }> {
  return apiFetch<{ snippet: AdminReviewSnippet }>(`/admin/review-snippets/${id}/unpublish`, { method: "POST", body: {} });
}

/** A render-ready candidate row — the comment plus the suggested anonymised label. */
export interface CandidateRow {
  feedbackId: string;
  comment: string;
  /** The editable, anonymised "Parent of <n>, <place>" suggestion (AC1). */
  suggestedAttribution: string;
  /** Formatted submission date (`YYYY-MM-DD`). */
  date: string;
}

/** Shape the candidates into render-ready rows (AC1). */
export function candidateRows(candidates: readonly ReviewSnippetCandidate[]): CandidateRow[] {
  return candidates.map((c) => ({
    feedbackId: c.feedbackId,
    comment: c.comment,
    suggestedAttribution: c.suggestedAttribution,
    date: c.submittedAt.slice(0, 10),
  }));
}

/** A render-ready curated-snippet row with its publish state (AC2/AC3). */
export interface SnippetRow {
  id: string;
  quote: string;
  attribution: string;
  published: boolean;
  /** A human publish-state label for the table. */
  statusLabel: string;
}

/** Shape the curated snippets into render-ready rows (AC2/AC3). */
export function snippetRows(snippets: readonly AdminReviewSnippet[]): SnippetRow[] {
  return snippets.map((s) => ({
    id: s.id,
    quote: s.quote,
    attribution: s.attributionLabel,
    published: s.published,
    statusLabel: s.published ? "Published" : "Draft",
  }));
}
