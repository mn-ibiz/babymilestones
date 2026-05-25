import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  HOME_HERO,
  HOME_UNITS,
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

export default function MarketingHomePage() {
  const { headline, subhead, cta, image } = HOME_HERO;
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
    </main>
  );
}
