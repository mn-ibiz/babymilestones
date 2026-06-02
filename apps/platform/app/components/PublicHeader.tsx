"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signInHref, signUpHref } from "../../lib/auth-form";

/**
 * Shared public (marketing) header (P1-E12-S04 AC1). Renders the "Sign in" +
 * "Sign up" CTAs on every public page. The current location is carried through
 * as `?next=` so that, after authenticating, the visitor lands back where they
 * were (AC2) — e.g. a `/book/talent` deep-link resumes its funnel. On the auth
 * pages themselves we don't re-capture (the page already owns its own `next`).
 */
export function PublicHeader() {
  const pathname = usePathname() ?? "/";
  const search = useSearchParams();

  // On /login or /signup the destination is already in the page's own ?next.
  const onAuthPage = pathname === "/login" || pathname === "/signup";
  const qs = search?.toString();
  const here = qs ? `${pathname}?${qs}` : pathname;
  const next = onAuthPage ? (search?.get("next") ?? null) : here;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-ink/10 px-4 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-base font-semibold text-ink">
          Baby Milestones
        </Link>
        {/* P6-E06-S04 (Story 36.4): the parenting-stories blog. */}
        <Link href="/blog" className="text-sm font-medium text-ink/70 hover:text-ink">
          Stories
        </Link>
      </div>
      <nav aria-label="Account" className="flex items-center gap-2">
        <Link
          href={signInHref(next)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Sign in
        </Link>
        <Link
          href={signUpHref(next)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-surface hover:opacity-90"
        >
          Sign up
        </Link>
      </nav>
    </header>
  );
}
