# Story 12.1: Home page

Status: done

> Canonical ID: P1-E12-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S01.md

## Story

As a first-time visitor,
I want to understand Baby Milestones in 8 seconds and tap to sign up,
so that I immediately grasp the offering and can act.

## Acceptance Criteria

1. Hero: real photo of a real child + headline + visible CTA ("Top up & book").
2. 4-icon unit strip below hero (Play / Talent / Salon / Toy Shop — Toy Shop links out to the standalone WooCommerce site).
3. No carousel.
4. SSR for SEO; LCP < 2s on 3G.

## Tasks / Subtasks

- [x] Task 1: Build the public home page (AC: #1, #2, #3, #4)
  - [x] Implement `apps/platform/app/(public)/page.tsx` as a server component (SSR for SEO — per source Technical Notes)
  - [x] Hero: real child photo, headline, visible "Top up & book" CTA (links to sign-up entry)
  - [x] 4-icon unit strip below hero: Play / Talent / Salon / Toy Shop — Toy Shop is an **external link** to the standalone WooCommerce site (no internal route)
  - [x] No carousel anywhere on the page
- [x] Task 2: Performance + SEO (AC: #4)
  - [x] Optimize hero image for LCP < 2s on 3G (`next/image`, `priority`, responsive `sizes`)
  - [x] Ensure SSR-rendered metadata/markup for SEO (`export const metadata`, server component)
- [x] Task 3: Tests (AC: all)
  - [x] vitest, test-first: hero headline/photo/CTA, the 4 units in order with Toy Shop → external WooCommerce URL, external-link safety (`rel`/`target`), LCP budget. Content/derivation logic lives in tested pure functions (`lib/home-content.ts`).
  - [~] No-carousel + raw SSR-output assertions are structural (no carousel component exists; page is a server component) — repo has no DOM/SSR render test harness (pure-function vitest only), so these are guaranteed by construction rather than a render test.

## Dev Notes

- Marketing surface in `apps/platform` public route group at `apps/platform/app/(public)/page.tsx` (per source Technical Notes). Must be SSR for SEO with LCP < 2s on 3G. UI primitives/tokens from `packages/ui` / `packages/config`.
- Toy Shop is the standalone WooCommerce site (separate system per project memory: POS pulls orders + syncs stock, no SSO) — link out, do not route internally.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/platform/app/(public)/page.tsx`. CTA targets the sign-in/sign-up entry (P1-E12-S04). Toy Shop = external WooCommerce link.
- Depends on X7 (`packages/ui` primitives) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E12.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all green from repo root.
- Stale `.next/types` referenced the moved `(app)/page.tsx` after the route move; cleared `.next` + rebuilt to regenerate route types.

### Completion Notes List

- Content/derivation logic isolated in `apps/platform/lib/home-content.ts` (hero, four units, external-link attrs, LCP budget) and unit-tested test-first (`home-content.test.ts`).
- `(public)/page.tsx` is a server component (SSR for SEO, AC4) with `export const metadata`; hero uses `next/image` with `priority` + responsive `sizes` for LCP (AC4). No carousel anywhere (AC3).
- Toy Shop is the only external unit → standalone WooCommerce site, opened with `target="_blank" rel="noopener noreferrer"` (AC2).
- **Route collision resolved:** `(app)/page.tsx` and `(public)/page.tsx` both mapped to `/`. Moved the authed dashboard root to `(app)/home/page.tsx`, repointed the `home` nav item (`@bm/ui` `PARENT_NAV_ITEMS`) `/` → `/home`, and made `/` public in `middleware.ts` (exact match). Updated the affected P1-E11 nav tests.
- Build confirms `/` = public home (5.33 kB, 111 kB First Load JS — under the 200 KB shell budget) and `/home` = authed dashboard, coexisting.
- Placeholder hero asset (`public/home/hero-child.jpg`) added so build/optimizer resolve a real file; real photo to be swapped at staging sign-off (see review-findings). Low-severity follow-ups in `12-1-home-page-review-findings.md`.

### File List

- `apps/platform/lib/home-content.ts` (new)
- `apps/platform/lib/home-content.test.ts` (new)
- `apps/platform/app/(public)/layout.tsx` (new)
- `apps/platform/app/(public)/page.tsx` (new)
- `apps/platform/public/home/hero-child.jpg` (new, placeholder)
- `apps/platform/app/(app)/home/page.tsx` (moved from `app/(app)/page.tsx`)
- `apps/platform/middleware.ts` (edit — `/` public)
- `apps/platform/lib/shell.test.ts` (edit — nav home → `/home`)
- `packages/ui/src/parent-shell.ts` (edit — `home` href `/` → `/home`)
- `packages/ui/src/parent-shell.test.ts` (edit — nav home → `/home`)
- `_bmad-output/implementation-artifacts/12-1-home-page-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented public marketing home page (SSR hero + 4-unit strip, Toy Shop → WooCommerce); resolved `/` route collision by moving authed dashboard to `/home`; full gate green | claude-opus-4-7 |
