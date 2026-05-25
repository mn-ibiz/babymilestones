# Review findings — 12-4-sign-in-sign-up-entry-points (P1-E12-S04)

Single self-review pass. No BLOCKER/high-severity issues; all fixed inline (none required).

## Deferred (low severity)

1. **Client JS now in the marketing layout (LOW).** The shared `PublicHeader` is a
   client component (`useSearchParams` to carry `?next=`), so the previously
   "no client JS" `(public)` layout (P1-E12-S01 AC4, LCP-on-3G) now ships a small
   client bundle. First Load JS for the home route stayed at ~111 kB and the
   header is tiny, so the 3G LCP budget is not believed to regress — but a
   follow-up could split the header into a server shell + a minimal client
   `next` capturer if a benchmark ever shows pressure.

2. **Duplicate CTAs on the auth pages (cosmetic).** `/login` and `/signup` render
   the global header CTAs in addition to their in-form cross-links. This is
   harmless (global chrome) and the header suppresses re-capturing `next` on
   auth pages, but a designer pass could hide the header CTAs on the auth routes.

3. **No DOM/e2e test for CTA presence (LOW).** Per the story's testing standard
   (vitest pure functions; no jsdom/Playwright configured in `apps/platform`),
   AC1 CTA-presence and AC2 redirect are covered at the logic layer
   (`signInHref`/`signUpHref`/`resolvePostAuthDest`/`mapAuthError` + submit
   wiring) rather than via a rendered-DOM assertion. A future e2e harness should
   assert the rendered header CTAs on every public page and the post-auth
   navigation end to end.
