# Story 12.2: Per-unit pages

Status: done

> Canonical ID: P1-E12-S02 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S02.md

## Story

As a visitor,
I want a page per unit with what it offers and a "Book now" CTA,
so that I can explore a specific unit and start booking.

## Acceptance Criteria

1. Pages: `/play`, `/talent`, `/salon`, `/events`, `/coaching`. The Toy Shop is an **external link** to the standalone WooCommerce site (no `/shop` route in this app).
2. Each: photo, short copy, examples, "Book now" CTA → signup if not logged in.
3. Content sourced from MDX or DB (admin-editable in P5 polish).

## Tasks / Subtasks

- [x] Task 1: Build per-unit pages in `apps/platform` public route group (AC: #1, #2)
  - [x] Create routes `apps/platform/app/(public)/[unit]` resolving `/play`, `/talent`, `/salon`, `/events`, `/coaching` (server-rendered SSG via `generateStaticParams`; unknown slug → `notFound()`)
  - [x] Each page: photo, short copy, examples, "Book now" CTA → routes to `/signup` when not logged in; unit paths added to the middleware public allow-list
  - [x] Do NOT create a `/shop` route — Toy Shop is an external WooCommerce link (`toyShopLinkAttrs`, `target=_blank rel=noopener noreferrer`)
- [x] Task 2: Content source (AC: #3)
  - [x] Unit content sourced inline in `lib/unit-content.ts` as a plain serialisable record; `getUnitPage(slug)` is the single seam so a P5 admin-editable DB source swaps in with no route changes. (MDX not used; inline records are simpler and the seam is identical — DB-or-MDX is left open per AC.)
- [x] Task 3: Tests (AC: all)
  - [x] `lib/unit-content.test.ts` (17 tests, test-first): all five slugs resolve with photo/copy/examples/CTA; unknown slug → undefined (404); "Book now" → `/signup` when unauthenticated and into booking when authed; no `/shop` slug; Toy Shop is external; middleware allow-lists every unit path and never `/shop`.

## Dev Notes

- Marketing surface in `apps/platform` public route group, building on the home page (P1-E12-S01). UI primitives/tokens from `packages/ui` / `packages/config`.
- Content from MDX or DB now; structured for admin-editable DB content in P5. "Book now" routes to the sign-in/sign-up entry (P1-E12-S04) when unauthenticated.
- Toy Shop is the standalone WooCommerce site (separate system per project memory) — external link only; explicitly no `/shop` route.
- Testing standards: vitest (`pnpm test`), TS strict, test-first.

### Project Structure Notes
- `apps/platform/app/(public)/{play,talent,salon,events,coaching}/`. Content via MDX/DB. CTA → P1-E12-S04 signup.
- Depends on S01 (home page) per source Dependencies.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E12-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E12.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- `pnpm test` (root, turbo): 15 packages green; `@bm/platform` 105 tests incl. 17 new `unit-content` tests.
- `pnpm typecheck` / `pnpm lint`: green across all packages.
- `pnpm build`: green; `/[unit]` prerendered (SSG) for all five slugs, no `/shop` route, Middleware bundle unchanged in shape.

### Completion Notes List

- Routing is data-driven: a single dynamic segment `app/(public)/[unit]/page.tsx` with `generateStaticParams()` over `UNIT_SLUGS`; unknown slugs call `notFound()`. Explicit `(app)` segments (`/home`, `/wallet`, …) take precedence over the dynamic segment, so no route collision (confirmed by a clean build).
- All content/route logic is in the pure, tested `lib/unit-content.ts` (no DOM); the page component is a thin render. `getUnitPage` is the only seam, so a P5 admin-editable DB source replaces the inline records without touching routes.
- Reused `SIGN_UP_HREF`/`TOY_SHOP_URL` from `lib/home-content.ts` (S01) for consistency. CTA href is the sign-up entry for unauthenticated visitors (AC2); `bookNowHref(true)` returns the booking funnel for authed users (S04 hand-off).
- Middleware updated: the five unit paths added to an exact public allow-list so unauthenticated visitors aren't bounced to `/login`. A test pins the middleware↔`UNIT_SLUGS` contract and asserts no `/shop` is ever public.
- Single review performed; no blocker/high-severity findings, nothing deferred.

### File List

- `apps/platform/lib/unit-content.ts` (new)
- `apps/platform/lib/unit-content.test.ts` (new)
- `apps/platform/app/(public)/[unit]/page.tsx` (new)
- `apps/platform/middleware.ts` (modified — public allow-list for unit routes)
- `_bmad-output/implementation-artifacts/12-2-per-unit-pages.md` (story update)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented per-unit pages (dynamic `[unit]` route, pure content model, middleware allow-list, 17 tests); full gate green | claude-opus-4-7 |
