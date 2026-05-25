import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ACQUISITION_COOKIE_MAX_AGE,
  ACQUISITION_COOKIE_NAME,
  resolveDeepLink,
} from "../../../../lib/book-deep-link";

/**
 * WhatsApp ad deep-link landing (P1-E12-S03).
 *
 * `/book/[unit]?utm_*` (AC1): pre-selects the unit, captures the UTM params into
 * a cookie that survives the signup funnel, and routes the visitor to the signup
 * entry with the unit carried (so the post-signup booking funnel resumes on the
 * right unit). An unknown unit slug 404s — there is no `/shop` (the Toy Shop is
 * the external WooCommerce site). The captured UTM is persisted to
 * `parents.acquisition_source` on signup for attribution (AC2).
 *
 * A server component so the cookie is set + the redirect issued before any HTML
 * streams — the visitor never sees this page, only the signup screen.
 */

type BookParams = { unit: string };

export default async function BookDeepLinkPage(props: {
  params: Promise<BookParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ unit }, query] = await Promise.all([props.params, props.searchParams]);

  const resolution = resolveDeepLink(unit, query);
  if (resolution.notFound) notFound();

  if (resolution.acquisitionCookieValue) {
    const store = await cookies();
    store.set(ACQUISITION_COOKIE_NAME, resolution.acquisitionCookieValue, {
      path: "/",
      maxAge: ACQUISITION_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false, // read client-side at signup to forward to the API
    });
  }

  redirect(resolution.redirectTo);
}
