"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CMS_PAGE_OPTIONS,
  emptyPageForm,
  pageToForm,
  formToSave,
  revisionRows,
  fetchPages,
  fetchPage,
  fetchPreview,
  fetchRevisions,
  savePage,
  publishPage,
  type CmsPage,
  type CmsPageForm,
  type CmsRevision,
  type CmsSection,
} from "../../lib/cms-pages";
import type { CmsPageSlug } from "@bm/contracts";

/**
 * CMS Pages screen (P6-E06-S03 / Story 36.3) — a lightweight CMS so admins edit the
 * public per-unit marketing pages WITHOUT a deploy. Pick a unit page, edit its hero
 * copy / image, CTA, and an ordered list of body sections (AC1); PREVIEW the draft
 * and PUBLISH it (AC2); and see the retained REVISION history (AC3). `manage
 * config`-gated server-side; this page reads it credentialed.
 */
export default function PagesPage() {
  const [slug, setSlug] = useState<CmsPageSlug>(CMS_PAGE_OPTIONS[0]!.value);
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [form, setForm] = useState<CmsPageForm>(emptyPageForm(CMS_PAGE_OPTIONS[0]!.value));
  const [status, setStatus] = useState<string>("draft");
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [preview, setPreview] = useState<CmsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    fetchPages()
      .then((r) => setPages(r.pages))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load pages"));
  }, []);

  const loadSlug = useCallback((s: CmsPageSlug) => {
    setError(null);
    setNotice(null);
    setPreview(null);
    Promise.all([
      fetchPage(s).then((r) => r.page).catch(() => null),
      fetchRevisions(s).then((r) => r.revisions).catch(() => []),
    ]).then(([page, revs]) => {
      setForm(page ? pageToForm(page) : emptyPageForm(s));
      setStatus(page ? page.status : "draft");
      setRevisions(revs);
    });
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    loadSlug(slug);
  }, [slug, loadSlug]);

  const onSave = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setNotice(null);
    savePage(formToSave(form))
      .then((r) => {
        setStatus(r.page.status);
        setNotice("Saved as draft.");
        refreshList();
        return fetchRevisions(slug);
      })
      .then((r) => setRevisions(r.revisions))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Save failed"));
  };

  const onPreview = () => {
    setError(null);
    fetchPreview(slug)
      .then((r) => setPreview(r.page))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Preview failed"));
  };

  const onPublish = () => {
    setError(null);
    setNotice(null);
    publishPage(slug)
      .then((r) => {
        setStatus(r.page.status);
        setNotice("Published.");
        refreshList();
        return fetchRevisions(slug);
      })
      .then((r) => setRevisions(r.revisions))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Publish failed"));
  };

  const setSection = (i: number, patch: Partial<CmsSection>) =>
    setForm((f) => ({
      ...f,
      bodySections: f.bodySections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  const addSection = () =>
    setForm((f) => ({ ...f, bodySections: [...f.bodySections, { heading: "", body: "" }] }));
  const removeSection = (i: number) =>
    setForm((f) => ({ ...f, bodySections: f.bodySections.filter((_, idx) => idx !== i) }));

  const revRows = revisionRows(revisions);

  return (
    <main>
      <h1>Pages</h1>
      <p>
        Edit the public marketing page for each unit — hero copy, image, the call-to-action and the body
        sections. Save keeps a draft; Publish makes it live. Every save is kept as a revision.
      </p>

      {error && <p role="alert">{error}</p>}
      {notice && <p>{notice}</p>}

      {/* Page picker. */}
      <section aria-label="Choose a page">
        <label>
          Page{" "}
          <select
            aria-label="Page"
            value={slug}
            onChange={(e) => setSlug(e.target.value as CmsPageSlug)}
          >
            {CMS_PAGE_OPTIONS.map((o) => {
              const existing = pages.find((p) => p.slug === o.value);
              return (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {existing ? ` (${existing.status})` : ""}
                </option>
              );
            })}
          </select>
        </label>{" "}
        <span>Status: {status}</span>
      </section>

      {/* AC1: the editor. */}
      <section aria-label="Edit page">
        <h2>Edit page</h2>
        <form onSubmit={onSave}>
          <label>
            Hero copy{" "}
            <textarea
              aria-label="Hero copy"
              value={form.heroCopy}
              onChange={(e) => setForm((f) => ({ ...f, heroCopy: e.target.value }))}
            />
          </label>
          <label>
            Hero image URL{" "}
            <input
              aria-label="Hero image URL"
              value={form.heroImageUrl}
              onChange={(e) => setForm((f) => ({ ...f, heroImageUrl: e.target.value }))}
            />
          </label>
          <label>
            CTA label{" "}
            <input
              aria-label="CTA label"
              value={form.ctaLabel}
              onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
            />
          </label>
          <label>
            CTA href{" "}
            <input
              aria-label="CTA href"
              value={form.ctaHref}
              onChange={(e) => setForm((f) => ({ ...f, ctaHref: e.target.value }))}
            />
          </label>

          <fieldset>
            <legend>Body sections</legend>
            {form.bodySections.map((s, i) => (
              <div key={i}>
                <label>
                  Heading{" "}
                  <input
                    aria-label={`Section ${i + 1} heading`}
                    value={s.heading}
                    onChange={(e) => setSection(i, { heading: e.target.value })}
                  />
                </label>
                <label>
                  Body{" "}
                  <textarea
                    aria-label={`Section ${i + 1} body`}
                    value={s.body}
                    onChange={(e) => setSection(i, { body: e.target.value })}
                  />
                </label>
                <button type="button" onClick={() => removeSection(i)}>
                  Remove section
                </button>
              </div>
            ))}
            <button type="button" onClick={addSection}>
              Add section
            </button>
          </fieldset>

          <button type="submit">Save draft</button>
        </form>

        {/* AC2: preview + publish. */}
        <div>
          <button type="button" onClick={onPreview}>
            Preview
          </button>{" "}
          <button type="button" onClick={onPublish}>
            Publish
          </button>
        </div>
      </section>

      {/* AC2: the draft preview render. */}
      {preview && (
        <section aria-label="Preview">
          <h2>Preview (draft)</h2>
          <h3>{preview.heroCopy}</h3>
          {preview.ctaLabel && <p>CTA: {preview.ctaLabel}</p>}
          <ul>
            {preview.bodySections.map((s, i) => (
              <li key={i}>
                <strong>{s.heading}</strong>
                {s.body && <span> — {s.body}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* AC3: the retained revision history. */}
      <section aria-label="Revisions">
        <h2>Revisions</h2>
        {revRows.length === 0 ? (
          <p>No revisions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Status</th>
                <th scope="col">Hero copy</th>
              </tr>
            </thead>
            <tbody>
              {revRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt}</td>
                  <td>{r.status}</td>
                  <td>{r.heroCopy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
