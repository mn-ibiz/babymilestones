import { apiFetch } from "./api";
import type { ArticleDto, ArticleSaveInput } from "@bm/contracts";

/**
 * Admin Blog / Articles client logic (P6-E06-S04 / Story 36.4). The `/articles`
 * admin screen reads the `manage config`-gated `/admin/articles` API (credentialed —
 * session cookie + CSRF) to list articles, create/edit one (slug / title / markdown
 * body / cover / tags / author), and publish/unpublish. Framework-free so it
 * unit-tests without React.
 */

export type Article = ArticleDto;

/** A status filter option for the admin list. */
export interface ArticleStatusOption {
  value: "all" | "draft" | "published";
  label: string;
}

export const ARTICLE_STATUS_OPTIONS: readonly ArticleStatusOption[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
];

/** The editable form state for one article. Tags are edited as a comma string. */
export interface ArticleForm {
  slug: string;
  title: string;
  bodyMd: string;
  coverImageUrl: string;
  /** Comma-separated tags as typed in the form. */
  tagsInput: string;
  author: string;
}

/** A blank form for a new article. */
export function emptyArticleForm(): ArticleForm {
  return { slug: "", title: "", bodyMd: "", coverImageUrl: "", tagsInput: "", author: "" };
}

/** Map a saved article DTO into editable form state. */
export function articleToForm(a: Article): ArticleForm {
  return {
    slug: a.slug,
    title: a.title,
    bodyMd: a.bodyMd,
    coverImageUrl: a.coverImageUrl ?? "",
    tagsInput: tagsToInput(a.tags),
    author: a.author,
  };
}

/** Split a comma-separated tags string into trimmed, non-blank tags. */
export function parseTagsInput(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Join tags back into the comma-separated form value. */
export function tagsToInput(tags: readonly string[]): string {
  return tags.join(", ");
}

/** Build the save payload from form state (tags parsed, blank cover → null). */
export function formToSave(form: ArticleForm): ArticleSaveInput {
  const cover = form.coverImageUrl.trim();
  return {
    slug: form.slug.trim(),
    title: form.title,
    bodyMd: form.bodyMd,
    coverImageUrl: cover === "" ? null : cover,
    tags: parseTagsInput(form.tagsInput),
    author: form.author,
  };
}

/* ------------------------------------------------------------- API wrappers */

/** List every article (drafts + published). */
export function fetchArticles(): Promise<{ articles: Article[] }> {
  return apiFetch<{ articles: Article[] }>("/admin/articles");
}

/** Read one article (the editor view) by id. */
export function fetchArticle(id: string): Promise<{ article: Article }> {
  return apiFetch<{ article: Article }>(`/admin/articles/${id}`);
}

/** Create a draft article (AC1/AC2). */
export function createArticle(input: ArticleSaveInput): Promise<{ article: Article }> {
  return apiFetch<{ article: Article }>("/admin/articles", { method: "POST", body: input });
}

/** Update an article by id (AC2). */
export function updateArticle(id: string, input: ArticleSaveInput): Promise<{ article: Article }> {
  return apiFetch<{ article: Article }>(`/admin/articles/${id}`, { method: "PATCH", body: input });
}

/** Publish an article (AC1). */
export function publishArticle(id: string): Promise<{ article: Article }> {
  return apiFetch<{ article: Article }>(`/admin/articles/${id}/publish`, { method: "POST" });
}

/** Unpublish an article — revert to draft (AC1). */
export function unpublishArticle(id: string): Promise<{ article: Article }> {
  return apiFetch<{ article: Article }>(`/admin/articles/${id}/unpublish`, { method: "POST" });
}
