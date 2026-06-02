"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchReviewSnippets,
  curateSnippet,
  editAttribution,
  publishSnippet,
  unpublishSnippet,
  candidateRows,
  snippetRows,
  type ReviewSnippetsState,
} from "../../lib/review-snippets";

/**
 * Public review snippets curation (P6-E04-S04 / Story 34.4).
 *
 * One screen where an admin CURATES which 5-star comments to publish as
 * testimonials on the marketing home page. The top table lists 5-star candidates,
 * each with a SUGGESTED anonymised attribution ("Parent of two, Nairobi") the admin
 * can edit before curating — anonymisation is ENFORCED, a real name is never shown
 * (AC1). The bottom table lists curated snippets with a Publish / Unpublish toggle
 * (audited server-side, AC3) and an inline attribution edit. Admin-gated
 * (`manage config`) server-side; this page reads it credentialed.
 */
export default function ReviewSnippetsPage() {
  const [state, setState] = useState<ReviewSnippetsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-candidate editable attribution overrides, keyed by feedback id.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    setError(null);
    fetchReviewSnippets()
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load review snippets"));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    (p: Promise<unknown>) => {
      setError(null);
      p.then(refresh).catch((e: unknown) => setError(e instanceof Error ? e.message : "Action failed"));
    },
    [refresh],
  );

  const candidates = state ? candidateRows(state.candidates) : [];
  const snippets = state ? snippetRows(state.snippets) : [];

  return (
    <main>
      <h1>Review snippets</h1>
      <p>
        Curate which 5-star comments appear on the public home page. Attribution is always anonymised — never a
        parent&rsquo;s real name.
      </p>

      {error && <p role="alert">{error}</p>}

      {/* AC1: 5-star candidates with an editable, anonymised attribution. */}
      <section aria-label="Candidates">
        <h2>5-star comments to curate</h2>
        {candidates.length === 0 ? (
          <p>No new 5-star comments to curate.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Comment</th>
                <th scope="col">Attribution (anonymised)</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.feedbackId}>
                  <td>{c.date}</td>
                  <td>{c.comment}</td>
                  <td>
                    <input
                      aria-label={`Attribution for ${c.feedbackId}`}
                      value={overrides[c.feedbackId] ?? c.suggestedAttribution}
                      onChange={(e) =>
                        setOverrides((o) => ({ ...o, [c.feedbackId]: e.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          curateSnippet({
                            feedbackId: c.feedbackId,
                            attributionLabel: overrides[c.feedbackId] ?? c.suggestedAttribution,
                          }),
                        )
                      }
                    >
                      Curate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC2/AC3: curated snippets with publish toggle + inline attribution edit. */}
      <section aria-label="Curated snippets">
        <h2>Curated snippets</h2>
        {snippets.length === 0 ? (
          <p>Nothing curated yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Quote</th>
                <th scope="col">Attribution</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {snippets.map((s) => (
                <tr key={s.id}>
                  <td>{s.quote}</td>
                  <td>
                    <input
                      aria-label={`Edit attribution for ${s.id}`}
                      defaultValue={s.attribution}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== s.attribution) {
                          run(editAttribution(s.id, e.target.value.trim()));
                        }
                      }}
                    />
                  </td>
                  <td>{s.statusLabel}</td>
                  <td>
                    {s.published ? (
                      <button type="button" onClick={() => run(unpublishSnippet(s.id))}>
                        Unpublish
                      </button>
                    ) : (
                      <button type="button" onClick={() => run(publishSnippet(s.id))}>
                        Publish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
