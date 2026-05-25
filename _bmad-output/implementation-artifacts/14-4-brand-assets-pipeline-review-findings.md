# X7-S04 Brand assets pipeline — review findings (follow-up log)

Single self-review of the X7-S04 diff. No BLOCKER/high-severity issues found; the
full gate (`pnpm test && pnpm typecheck && pnpm lint && pnpm build`) is green.
Lower-severity items below are deferred (not acted on in this story).

## Low severity / future

1. **App UI surfaces still inline the brand name.** `apps/platform`
   (`PublicHeader.tsx`, `ParentShellLayout.tsx`, page `<title>` metadata) hardcode
   `"Baby Milestones"`. The brand source (`@bm/ui` `BRAND.name`) now exists and the
   in-scope AC2 consumers (receipts E08 + SMS-stub bodies E09) draw from it, but the
   marketing/app chrome could later be migrated to `BRAND.name` / `BRAND.tagline`
   for full single-sourcing. Out of scope here (separate app epics).

2. **`favicon` asset reuses `logo-mark.svg`.** The manifest registers a `favicon`
   entry pointing at the mark SVG rather than a dedicated multi-size favicon set.
   Adequate for an SVG-favicon launch; a future task can add `.ico`/PNG variants
   and an OG image entry to the manifest if needed.

3. **`brandColors` override is colour-only and merges shallowly** over base tokens
   (`{ ...tokens.color, ...overrides }`). Nested shade maps (e.g. `primary`) are
   replaced wholesale if overridden. Fine for the current single-key override; a
   deep-merge could be added if designers need per-shade overrides.
