# Story 12.1: Home page

Status: ready-for-dev

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

- [ ] Task 1: Build the public home page (AC: #1, #2, #3, #4)
  - [ ] Implement `apps/platform/app/(public)/page.tsx` as a server component (SSR for SEO — per source Technical Notes)
  - [ ] Hero: real child photo, headline, visible "Top up & book" CTA (links to sign-up entry)
  - [ ] 4-icon unit strip below hero: Play / Talent / Salon / Toy Shop — Toy Shop is an **external link** to the standalone WooCommerce site (no internal route)
  - [ ] No carousel anywhere on the page
- [ ] Task 2: Performance + SEO (AC: #4)
  - [ ] Optimize hero image for LCP < 2s on 3G (responsive image, priority load)
  - [ ] Ensure SSR-rendered metadata/markup for SEO
- [ ] Task 3: Tests (AC: all)
  - [ ] Write unit/integration/e2e tests: hero + CTA render server-side; 4 unit icons present with Toy Shop pointing to the external WooCommerce URL; no carousel component; SSR output present; LCP budget check on 3G. Use vitest, test-first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
