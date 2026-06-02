"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ARTICLE_STATUS_OPTIONS,
  emptyArticleForm,
  articleToForm,
  formToSave,
  fetchArticles,
  createArticle,
  updateArticle,
  publishArticle,
  unpublishArticle,
  type Article,
  type ArticleForm,
} from "../../lib/articles";

/**
 * Blog / Articles screen (P6-E06-S04 / Story 36.4) — a parenting-articles blog for
 * SEO + engagement. List every article (drafts + published, filterable), create a
 * new one or edit an existing one (slug / title / markdown body / cover / tags /
 * author — AC2), and PUBLISH / UNPUBLISH it (AC1). `manage config`-gated server-side;
 * this page reads it credentialed.
 */
export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyArticleForm());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    fetchArticles()
      .then((r) => setArticles(r.articles))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load articles"));
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyArticleForm());
    setNotice(null);
    setError(null);
  };

  const startEdit = (a: Article) => {
    setEditingId(a.id);
    setForm(articleToForm(a));
    setNotice(null);
    setError(null);
  };

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setNotice(null);
    const payload = formToSave(form);
    const op = editingId ? updateArticle(editingId, payload) : createArticle(payload);
    op.then((r) => {
      setEditingId(r.article.id);
      setForm(articleToForm(r.article));
      setNotice(editingId ? "Saved." : "Article created (draft).");
      refreshList();
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Save failed"));
  };

  const onPublish = () => {
    if (!editingId) return;
    setError(null);
    setNotice(null);
    publishArticle(editingId)
      .then((r) => {
        setForm(articleToForm(r.article));
        setNotice("Published.");
        refreshList();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Publish failed"));
  };

  const onUnpublish = () => {
    if (!editingId) return;
    setError(null);
    setNotice(null);
    unpublishArticle(editingId)
      .then((r) => {
        setForm(articleToForm(r.article));
        setNotice("Unpublished (back to draft).");
        refreshList();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unpublish failed"));
  };

  const editing = editingId ? articles.find((a) => a.id === editingId) : undefined;
  const visible = articles.filter((a) => filter === "all" || a.status === filter);

  return (
    <main>
      <h1>Blog</h1>
      <p>
        Write and publish parenting articles for the public blog. Save keeps a draft; Publish makes it
        live. The body is markdown — headings, bold/italic, links and lists are supported.
      </p>

      {error && <p role="alert">{error}</p>}
      {notice && <p>{notice}</p>}

      {/* The list of articles. */}
      <section aria-label="Articles">
        <h2>Articles</h2>
        <label>
          Show{" "}
          <select
            aria-label="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "draft" | "published")}
          >
            {ARTICLE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="button" onClick={startNew}>
          New article
        </button>
        {visible.length === 0 ? (
          <p>No articles yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Slug</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.slug}</td>
                  <td>{a.status}</td>
                  <td>
                    <button type="button" onClick={() => startEdit(a)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* AC2: the create / edit form. */}
      <section aria-label="Edit article">
        <h2>{editingId ? "Edit article" : "New article"}</h2>
        {editing && <p>Status: {editing.status}</p>}
        <form onSubmit={onSubmit}>
          <label>
            Title{" "}
            <input
              aria-label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label>
            Slug{" "}
            <input
              aria-label="Slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </label>
          <label>
            Author{" "}
            <input
              aria-label="Author"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            />
          </label>
          <label>
            Cover image URL{" "}
            <input
              aria-label="Cover image URL"
              value={form.coverImageUrl}
              onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
            />
          </label>
          <label>
            Tags (comma-separated){" "}
            <input
              aria-label="Tags"
              value={form.tagsInput}
              onChange={(e) => setForm((f) => ({ ...f, tagsInput: e.target.value }))}
            />
          </label>
          <label>
            Body (markdown){" "}
            <textarea
              aria-label="Body"
              value={form.bodyMd}
              onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
            />
          </label>
          <button type="submit">{editingId ? "Save" : "Create"}</button>
        </form>

        {/* AC1: publish controls (only for a saved article). */}
        {editingId && (
          <div>
            <button type="button" onClick={onPublish}>
              Publish
            </button>{" "}
            <button type="button" onClick={onUnpublish}>
              Unpublish
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
