# P1-E12-S01 — Review findings (follow-up log)

Single self-review of the home-page diff. All BLOCKER/high-severity items were
fixed inline before commit; the items below are lower-severity follow-ups only.

## Deferred (low severity)

1. **Unit-strip icons are placeholder glyphs.** Each unit card renders a neutral
   `●` with a `data-icon` attribute rather than a real SVG/icon component. The
   icon set belongs to the shared `@bm/ui` primitives (story dependency X7);
   wire real icons there and consume them here. Functionally complete and
   accessible today (`aria-hidden` on the glyph, visible text label per unit).

2. **Hero image is a tiny placeholder asset.** `public/home/hero-child.jpg` is a
   minimal valid JPEG so the build and `next/image` optimizer resolve a real
   file. Swap in the real, art-directed child photo before staging sign-off
   (DoD step 6: PM + designer walkthrough). The render is already LCP-optimized
   (`priority`, responsive `sizes`).

## Notes (no action)

- Resolving the `/` route collision required moving the authed dashboard root
  from `(app)/page.tsx` to `(app)/home/page.tsx` and repointing the `home`
  nav item (`@bm/ui` `PARENT_NAV_ITEMS`) from `/` to `/home`. P1-E11 nav tests
  (`packages/ui/src/parent-shell.test.ts`, `apps/platform/lib/shell.test.ts`)
  were updated to match. `/` is now public (middleware exact-match).
