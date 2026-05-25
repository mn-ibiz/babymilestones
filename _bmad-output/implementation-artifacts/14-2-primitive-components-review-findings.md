# Review findings — 14-2-primitive-components (X7-S02)

Single self-review of the diff. No BLOCKER/high-severity issues; the items below
are lower-severity follow-ups deliberately left for a later pass (logged, not acted on).

## Deferred (low / medium)

1. **WCAG AA contrast of `primary-500` + white text (medium).**
   `Button variant="primary"` and the selected `ChipGroup` chip render white text
   on `primary-500` (`#FF6B9D`), which measures ~2.3:1 — below the 4.5:1 AA bar for
   normal text. The brand fill is inherited from the X7-S01 token palette, so the
   correct fix is a token/palette decision (e.g. darken the action fill to
   `primary-600`/`700` for text-bearing surfaces, or pair the light fill with
   `neutral-900` text). Tracked here rather than silently re-defining brand tokens
   inside a primitives story. AC2's other guarantees (keyboard operability, visible
   focus ring) are fully met and tested.

2. **`OTPInput` sparse-entry edge (low).**
   The controlled value collapses unentered boxes (spaces are stripped), so typing
   into a non-adjacent box can shift earlier digits. The common flows — sequential
   typing and backspace — are tested and correct; full per-index paste/scatter
   handling is a refinement for the compound OTP screen (X7-S03 / auth surfaces).

3. **Storybook runtime not installed (low).**
   AC3 stories ship as standard CSF (`primitives.stories.tsx`) typed against a local
   `storybook-types.ts` shim so they typecheck/lint inside `@bm/ui`'s own gate
   without pulling the heavy Storybook runtime into this package. Wiring an actual
   Storybook host (build target + addons) is a docs-surface task, not a primitive
   concern.
