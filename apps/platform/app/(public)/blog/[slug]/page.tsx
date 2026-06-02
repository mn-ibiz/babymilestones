import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPublishedArticle,
  renderArticleMarkdown,
  shareLinks,
} from "../../../../lib/blog";
import { safeImageSrc } from "../../../../lib/cms-page";
import { articleJsonLd, buildMetadata } from "../../../../lib/seo";
import { JsonLd } from "../../../components/JsonLd";

/**
 * Public per-article page (P6-E06-S04 / Story 36.4) at `/blog/[slug]`.
 *
 * A server component (SSR for SEO) that renders a single PUBLISHED parenting
 * article (AC3): cover, title, author, the markdown body rendered to a SAFE HTML
 * subset (see {@link renderArticleMarkdown} — XSS-safe by construction, no MDX
 * dependency), and WhatsApp / X / Facebook SHARE-BY-URL buttons (no external SDK).
 *
 * Drafts are never returned by the public endpoint, so an unpublished (or unknown)
 * slug resolves to null → `notFound()` (404). The render is dynamic (no
 * generateStaticParams) so newly-published articles appear without a redeploy.
 */

type ArticleParams = { slug: string };

export async function generateMetadata(props: {
  params: Promise<ArticleParams>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const article = await fetchPublishedArticle(slug);
  if (!article) return {};
  // A short, plain-text description from the start of the body (markup stripped).
  const description = article.bodyMd.replace(/[#*_>\-`[\]()]/gu, "").trim().slice(0, 160);
  // Story 36.2 AC2: full canonical + OG (type=article) + Twitter, using the
  // article cover as the share image when present. Defence-in-depth (security review
  // of 36.4): only a scheme-safe cover becomes the OG/Twitter image, so a pre-refine
  // `javascript:`/`data:`/`//evil` value can't leak into a share meta tag.
  const cover = safeImageSrc(article.coverImageUrl ?? "");
  return buildMetadata({
    title: `${article.title} — Baby Milestones`,
    description,
    path: `/blog/${slug}`,
    type: "article",
    ...(cover ? { image: cover } : {}),
  });
}

export default async function ArticleDetailPage(props: {
  params: Promise<ArticleParams>;
}) {
  const { slug } = await props.params;
  const article = await fetchPublishedArticle(slug);
  if (!article) notFound();

  const bodyHtml = renderArticleMarkdown(article.bodyMd);
  const shares = shareLinks(article);
  // Defence-in-depth (security review of 36.4): a scheme-safe cover only, reused for
  // the next/image render and the Article JSON-LD image. An unsafe (pre-refine) value
  // collapses to undefined, so the <Image> is dropped and the JSON-LD omits `image`.
  const coverSrc = safeImageSrc(article.coverImageUrl ?? "");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      {/* Story 36.2 AC2: per-article Article structured data (LocalBusiness is in the layout). */}
      <JsonLd data={articleJsonLd({ ...article, coverImageUrl: coverSrc ?? null })} />
      <p className="text-sm text-ink/60">
        <Link href="/blog" className="text-brand hover:underline">
          ← All stories
        </Link>
      </p>

      <article className="mt-4">
        <h1 className="text-3xl font-semibold leading-tight text-ink">{article.title}</h1>
        <p className="mt-3 text-sm text-ink/60">By {article.author}</p>

        {article.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {article.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/blog?tag=${encodeURIComponent(t)}`}
                  className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-ink/70 hover:bg-ink/10"
                >
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {coverSrc && (
          <Image
            src={coverSrc}
            alt={article.title}
            width={1024}
            height={576}
            priority
            sizes="(min-width: 768px) 768px, 100vw"
            className="mt-6 h-auto w-full rounded-xl object-cover"
          />
        )}

        {/* SAFE markdown body. `bodyHtml` is built only from HTML-escaped text + a
            fixed tag allow-list (renderArticleMarkdown), so it cannot inject script. */}
        <div
          className="prose prose-ink mt-8 max-w-none text-base leading-relaxed text-ink/80"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>

      {/* Share buttons (AC3) — plain anchors to each network's URL share endpoint. */}
      <section aria-label="Share this article" className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="text-sm font-medium text-ink/70">Share this article</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {shares.map((s) => (
            <li key={s.network}>
              <a
                href={s.href}
                target="_blank"
                rel={s.rel}
                aria-label={s.label}
                data-network={s.network}
                className="inline-flex items-center rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
