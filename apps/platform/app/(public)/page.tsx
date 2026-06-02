import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  HOME_HERO,
  HOME_UNITS,
  TESTIMONIALS_HEADING,
  fetchHomeTestimonials,
  unitLinkAttrs,
} from "../../lib/home-content";

/**
 * Public marketing home page (P1-E12-S01) at `/`.
 *
 * A server component (SSR for SEO, AC4) that renders three things from the pure
 * {@link HOME_HERO}/{@link HOME_UNITS} content model: the hero (real-child photo
 * + headline + the "Top up & book" CTA, AC1), the four-unit strip (Play /
 * Talent / Salon / Toy Shop, AC2), and nothing else — no carousel anywhere
 * (AC3). The hero image loads with `priority` so the LCP element is fetched
 * eagerly to meet the sub-2s-on-3G budget (AC4).
 */

export const metadata: Metadata = {
  title: "Baby Milestones — Play, Talent, Salon & Toy Shop",
  description:
    "Play, talent, salon and toy shop for your little one — one wallet, one tap. Top up and book in seconds.",
};

export default async function MarketingHomePage() {
  const { headline, subhead, cta, image } = HOME_HERO;
  // P6-E04-S04 (Story 34.4 AC2): the CURATED, published testimonials. Sourced from
  // the public review-snippets endpoint, which strips ALL parent PII; an outage
  // resolves to an empty list so the home page never breaks on it.
  const testimonials = await fetchHomeTestimonials();
  return (
    <main>
      {/* Hero (AC1) */}
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:gap-10 md:py-16">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">
            {headline}
          </h1>
          <p className="mt-4 max-w-prose text-base text-ink/70">{subhead}</p>
          <Link
            href={cta.href}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-base font-medium text-surface hover:opacity-90"
          >
            {cta.label}
          </Link>
        </div>
        <div className="flex-1">
          <Image
            src={image.src}
            alt={image.alt}
            width={960}
            height={720}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="h-auto w-full rounded-xl object-cover"
          />
        </div>
      </section>

      {/* Four-unit strip (AC2). Toy Shop links out to WooCommerce. */}
      <section
        aria-label="Our units"
        className="mx-auto max-w-5xl px-4 pb-12 md:pb-20"
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HOME_UNITS.map((unit) => {
            const attrs = unitLinkAttrs(unit);
            return (
              <li key={unit.key}>
                <a
                  href={attrs.href}
                  target={attrs.target}
                  rel={attrs.rel}
                  className="flex h-full flex-col items-center gap-2 rounded-lg border border-ink/10 bg-surface p-5 text-center text-ink hover:bg-ink/5"
                >
                  <span
                    aria-hidden
                    data-icon={unit.icon}
                    className="text-2xl"
                  >
                    ●
                  </span>
                  <span className="text-base font-medium">{unit.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Testimonials (P6-E04-S04 / Story 34.4 AC2). Curated, anonymised 5-star
          quotes — never a real parent name. Hidden entirely when none are published. */}
      {testimonials.length > 0 && (
        <section
          aria-label={TESTIMONIALS_HEADING}
          className="mx-auto max-w-5xl px-4 pb-16 md:pb-24"
        >
          <h2 className="text-2xl font-semibold text-ink md:text-3xl">{TESTIMONIALS_HEADING}</h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <li
                key={t.id}
                className="flex h-full flex-col justify-between rounded-xl border border-ink/10 bg-surface p-5"
              >
                <blockquote className="text-base text-ink/80">&ldquo;{t.quote}&rdquo;</blockquote>
                <p className="mt-4 text-sm font-medium text-ink/60">— {t.attribution}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
