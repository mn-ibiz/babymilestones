# Review findings — P1-E11-S05 (bottom nav + mobile-first shell)

Single review pass. No BLOCKER/high-severity issues found; all fixed inline = 0.
Lower-severity follow-ups deferred below.

## Deferred (lower severity)

1. **Automated bundle-size gate not wired into build (AC3).** `lib/shell.ts`
   exposes `INITIAL_JS_BUDGET_BYTES` (204_800) + `withinInitialJsBudget()` and a
   unit test asserts the predicate, and the budget was verified *empirically*
   from `next build` output (Home `/` = 105 kB First Load JS; largest route
   121 kB — all well under 200 KB). What is NOT yet automated is a CI step that
   parses real route sizes and fails the build on regression. Follow-up: add a
   post-build script (e.g. read `.next` route manifest / gzip the route chunks)
   that calls `withinInitialJsBudget()` so a future heavy import trips the gate.
   Severity: low — current sizes have ~40% headroom.

2. **3G-fast <1s load (AC2) not measured in CI.** Satisfied by design (server
   components + a single small client nav island, no icon library), but there is
   no automated Lighthouse/throttled-3G assertion. Follow-up: add a perf check
   via the `/benchmark` skill against the deployed staging build.

3. **Nav icons are inline Unicode glyphs** (`ShellNav.iconGlyph`) chosen to keep
   the bundle light (AC3). Cosmetic — swap for the design-system icon set when
   X7 primitives ship proper icons, keeping them tree-shakeable.
