# Review findings — P1-E12-S02 (per-unit marketing pages)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `59406373`.
Security clean (no `dangerouslySetInnerHTML`; auto-escaped JSX; external Toy Shop link uses
`rel="noopener noreferrer"`; no SSRF/open-redirect; SSG with `notFound()` on unknown slug). No code
changed — findings are content/product decisions or belong to the CMS story.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] All five hero images reference non-existent `/units/*.jpg`** → broken images on
  every public per-unit page (no `public/units/` assets exist; not caught by build or tests; still
  broken in the working tree). Needs the real photos sourced (product/design) or an agreed placeholder.
- **[Decision][LOW] "Book now" CTA is hard-wired to `/signup` for ALL visitors** (incl. authenticated);
  `bookNowHref(isAuthenticated)` exists, is tested, but has no caller (dead code → false coverage).
  Decide: wire authed CTA into the booking funnel, or delete the dead helper + its misleading test.

## Deferred / tracked
- **[Defer] CMS `[unit]` dynamic route can render arbitrary slugs** (e.g. an internal `/shop`,
  contradicting AC1) — introduced later by P5-E06-S03, gated behind auth (not in the public
  allow-list). Will address in the Epic 36 review (set `dynamicParams = false` or reject non-`UNIT_SLUGS`).

## Dismissed
Route collision with authed `(app)` segments (literal wins); SSG vs dynamic; XSS/href surface; home-content reuse.
