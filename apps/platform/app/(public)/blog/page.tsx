import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fetchPublishedArticles } from "../../../lib/blog";
import { buildMetadata } from "../../../lib/seo";

/**
 * Public Blog index (P6-E06-S04 / Story 36.4) at `/blog`.
 *
 * A server component (SSR for SEO) that lists the PUBLISHED parenting articles
 * newest-first (AC3), optionally filtered by `?tag=`. Each card links to the
 * per-article detail page. Drafts are never returned by the public endpoint, so
 * they can never appear here. An API outage resolves to an empty list (the page
 * renders an empty state rather than crashing).
 */

// Story 36.2 AC2: canonical + OG + Twitter for the blog index. The branded title
// is set absolute so the `<title>`, OG and Twitter cards all read consistently
// (the root template would otherwise only brand the document title, not OG).
export const metadata: Metadata = {
  ...buildMetadata({
    title: "Parenting stories & tips — Baby Milestones",
    description:
      "Practical parenting articles on play, development, nutrition, sleep and more from the Baby Milestones team.",
    path: "/blog",
  }),
  title: { absolute: "Parenting stories & tips — Baby Milestones" },
};

type BlogParams = { searchParams: Promise<{ tag?: string }> };

export default async function BlogIndexPage({ searchParams }: BlogParams) {
  const { tag } = await searchParams;
  const articles = await fetchPublishedArticles(tag ? { tag } : {});

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-ink">Parenting stories</h1>
        <p className="mt-3 max-w-prose text-base text-ink/70">
          Practical, gentle advice for every stage — play, development, nutrition, sleep and more.
        </p>
        {tag && (
          <p className="mt-2 text-sm text-ink/60">
            Showing articles tagged <span className="font-medium">{tag}</span>.{" "}
            <Link href="/blog" className="text-brand hover:underline">
              Clear filter
            </Link>
          </p>
        )}
      </header>

      {articles.length === 0 ? (
        <p className="mt-10 text-base text-ink/60">No articles yet — check back soon.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <li
              key={a.slug}
              className="flex h-full flex-col overflow-hidden rounded-xl border border-ink/10 bg-surface"
            >
              <Link href={`/blog/${a.slug}`} className="flex h-full flex-col hover:bg-ink/5">
                {a.coverImageUrl && (
                  <Image
                    src={a.coverImageUrl}
                    alt={a.title}
                    width={640}
                    height={360}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="h-44 w-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold text-ink">{a.title}</h2>
                  <p className="mt-2 text-sm text-ink/60">By {a.author}</p>
                  {a.tags.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {a.tags.map((t) => (
                        <li
                          key={t}
                          className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-ink/70"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
