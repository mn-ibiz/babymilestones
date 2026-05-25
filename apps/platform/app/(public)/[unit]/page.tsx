import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UNIT_SLUGS, getUnitPage } from "../../../lib/unit-content";

/**
 * Per-unit marketing page (P1-E12-S02) at `/play`, `/talent`, `/salon`,
 * `/events`, `/coaching`.
 *
 * A server component (SSR for SEO) that renders a single unit's photo, short
 * copy, examples and the "Book now" CTA (AC2) from the pure `unit-content`
 * model. Routing is data-driven: `generateStaticParams` enumerates the five
 * unit slugs and any unknown slug falls through to `notFound()` — there is no
 * `/shop` route (the Toy Shop is the external WooCommerce site, AC1).
 *
 * The "Book now" CTA points at the sign-up entry; the middleware bounces an
 * unauthenticated visitor there anyway, and once signed in S04 resumes the
 * booking funnel.
 */

type UnitParams = { unit: string };

export function generateStaticParams(): UnitParams[] {
  return UNIT_SLUGS.map((unit) => ({ unit }));
}

export async function generateMetadata(props: {
  params: Promise<UnitParams>;
}): Promise<Metadata> {
  const { unit } = await props.params;
  const page = getUnitPage(unit);
  if (!page) return {};
  return {
    title: `${page.title} — Baby Milestones`,
    description: page.summary,
  };
}

export default async function UnitPage(props: {
  params: Promise<UnitParams>;
}) {
  const { unit } = await props.params;
  const page = getUnitPage(unit);
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:py-16">
      <section className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">
            {page.title}
          </h1>
          <p className="mt-4 max-w-prose text-base text-ink/70">
            {page.summary}
          </p>
          <Link
            href={page.cta.href}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-medium text-surface hover:opacity-90"
          >
            {page.cta.label}
          </Link>
        </div>
        <div className="flex-1">
          <Image
            src={page.image.src}
            alt={page.image.alt}
            width={960}
            height={720}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="h-auto w-full rounded-xl object-cover"
          />
        </div>
      </section>

      <section aria-label="What we offer" className="mt-10 md:mt-14">
        <h2 className="text-xl font-semibold text-ink">What we offer</h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {page.examples.map((example) => (
            <li
              key={example}
              className="rounded-lg border border-ink/10 bg-surface p-4 text-base text-ink"
            >
              {example}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
