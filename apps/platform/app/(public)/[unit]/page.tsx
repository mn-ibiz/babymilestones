import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UNIT_SLUGS } from "../../../lib/unit-content";
import { fetchPublishedUnitPage, resolveUnitPageView } from "../../../lib/cms-page";

/**
 * Per-unit marketing page (P1-E12-S02) at `/play`, `/talent`, `/salon`,
 * `/events`, `/coaching`.
 *
 * A server component (SSR for SEO) that renders a single unit's photo, short
 * copy, examples and the "Book now" CTA (AC2). Routing is data-driven:
 * `generateStaticParams` enumerates the five unit slugs and any unknown slug falls
 * through to `notFound()` — there is no `/shop` route (the Toy Shop is the external
 * WooCommerce site, AC1).
 *
 * P6-E06-S03 (Story 36.3): the page now renders ADMIN-EDITED CMS content when a
 * PUBLISHED `cms_pages` row exists for the slug, falling back to the static
 * `unit-content` model otherwise — `resolveUnitPageView` is the single merge seam.
 * The CMS fetch is best-effort: any failure resolves to the static page, never a
 * crash. Drafts are never fetched here (the public endpoint serves published only).
 */

type UnitParams = { unit: string };

export function generateStaticParams(): UnitParams[] {
  return UNIT_SLUGS.map((unit) => ({ unit }));
}

export async function generateMetadata(props: {
  params: Promise<UnitParams>;
}): Promise<Metadata> {
  const { unit } = await props.params;
  const cms = await fetchPublishedUnitPage(unit);
  const view = resolveUnitPageView(unit, cms);
  if (!view) return {};
  return {
    title: `${view.title} — Baby Milestones`,
    description: view.heroCopy,
  };
}

export default async function UnitPage(props: {
  params: Promise<UnitParams>;
}) {
  const { unit } = await props.params;
  // Prefer published CMS content; fall back to the static unit page (AC1 fallback).
  const cms = await fetchPublishedUnitPage(unit);
  const view = resolveUnitPageView(unit, cms);
  if (!view) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <section className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">
            {view.title}
          </h1>
          <p className="mt-4 max-w-prose text-base text-ink/70">{view.heroCopy}</p>
          <Link
            href={view.cta.href}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-medium text-surface hover:opacity-90"
          >
            {view.cta.label}
          </Link>
        </div>
        {view.heroImageSrc && (
          <div className="flex-1">
            <Image
              src={view.heroImageSrc}
              alt={view.heroImageAlt}
              width={960}
              height={720}
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full rounded-xl object-cover"
            />
          </div>
        )}
      </section>

      {view.sections.length > 0 && (
        <section aria-label="What we offer" className="mt-10 md:mt-14">
          <h2 className="text-xl font-semibold text-ink">What we offer</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {view.sections.map((section) => (
              <li
                key={section.heading}
                className="rounded-lg border border-ink/10 bg-surface p-4 text-base text-ink"
              >
                <span className="font-medium">{section.heading}</span>
                {section.body && <p className="mt-1 text-ink/70">{section.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
