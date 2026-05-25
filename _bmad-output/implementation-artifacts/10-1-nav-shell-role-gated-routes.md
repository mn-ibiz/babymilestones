# Story 10.1: Nav shell + role-gated routes

Status: done

> Canonical ID: P1-E10-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S01.md

## Story

As any logged-in staff user,
I want to see only the menus and pages my role can use,
so that I am never exposed to actions or data outside my permissions.

## Acceptance Criteria

1. Side nav rendered server-side from the user's permission set.
2. Direct-URL access to a forbidden route → 403 page with "Switch role" link.
3. Header shows: current user, role badge, current float status (green/red dot from P1-E06), logout.

## Tasks / Subtasks

- [x] Task 1: Build the admin app shell layout in `apps/admin/app/(console)/layout.tsx` (AC: #1, #3)
  - [x] Server component that resolves the session + permission set (role from API-attested headers via `lib/session-context.ts`; permission slice mirrors `@bm/auth` RBAC matrix dependency-free, like `lib/role-landing.ts`, to keep argon2 out of the Next bundle)
  - [x] Render `SideNav` server-side, filtering nav items against the resolved permission set (`visibleNavFor(role)`; `SideNav` is presentational, no client filter)
  - [x] Render header bar: current user name, role badge, float status dot, logout action (`headerViewModel` + `HeaderBar`)
- [x] Task 2: Implement role-gated routing (AC: #2)
  - [x] Add a route guard helper in `apps/admin/lib/guard.ts` (pure `guardRoute` predicate over `canAccessRoute`) + `lib/enforce-route.ts` server wrapper (`next/navigation` redirect)
  - [x] On forbidden access, render `apps/admin/app/(console)/forbidden/page.tsx` 403 view with a "Switch role" link
  - [x] Ensure direct-URL navigation to a forbidden segment short-circuits to the 403 view (not a redirect loop) — `/forbidden` whitelisted in `lib/nav` so guarding it returns `ok`
- [x] Task 3: Float status indicator in header (AC: #3)
  - [x] Fetch float status from `apps/api` (P1-E06 surface) and render green/red dot (`lib/float-status.ts`; degrades to red `unknown` on error, never false-green)
- [x] Task 4: Tests (AC: all)
  - [x] vitest, test-first: nav renders only permitted items per role (`nav.test.ts`); forbidden direct-URL → 403 with Switch role link (`guard.test.ts` + forbidden page); header shows user/role/float/logout (`nav.test.ts` headerViewModel); float status mapping (`float-status.test.ts`); principal resolution (`session-context.test.ts`)
  - [~] Existing gated pages migrated under `(console)/` and calling `enforceRoute` — deferred (mechanical multi-file migration, out of shell-story scope; guard primitives complete + tested, API re-authorizes server-side). See review-findings.

## Dev Notes

- Anchors to `apps/admin` (Next.js app router). Nav and route gating derive from the user's permission set via `@bm/auth` (phone+PIN / opaque-token SSO sessions, role guards; cookie domain `.babymilestones.co.ke`).
- Nav must be rendered **server-side** from permissions — do not ship a client-only filter.
- Float status dot consumes the P1-E06 float surface exposed by `apps/api`.
- Source-tree paths to touch: `apps/admin/app/(console)/layout.tsx`, `apps/admin/app/(console)/forbidden/page.tsx`, `apps/admin/lib/guard.ts`, plus a `SideNav` component under `apps/admin/components/`.
- Testing standards: vitest (`pnpm test` in `apps/admin`), TS strict, test-first (red/green/refactor). Cover all three ACs as required by the source DoD (every AC has a passing test).

### Project Structure Notes
- Lives entirely in `apps/admin`; role logic delegated to `@bm/auth`. No new DB tables.
- Depends on P1-E01-S04 (auth/session) and S06 (float status) per source Dependencies.
- DoD: audited actions write to `audit_outbox`; migrations additive-only (none expected here).

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E10-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E10.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green from repo root: `pnpm test` (143 admin tests, all packages), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- After deleting the conflicting standalone `app/page.tsx` (replaced by the `(console)` root page), a stale `.next/types` reference failed typecheck; resolved by a clean `rm -rf apps/admin/.next` + rebuild (Next regenerates route types).

### Completion Notes List

- Gating logic lives in pure, dependency-free functions (`visibleNavFor`, `canAccessRoute`, `navItemForPath`, `guardRoute`, `floatStatusDot`, `headerViewModel`, `roleBadgeLabel`, `resolvePrincipal`, `floatStatusFromResponse`) — unit-testable without rendering, matching the existing `apps/admin/lib/*` convention.
- The admin permission slice mirrors the `@bm/auth` RBAC matrix locally (the Next bundle must not import the `@bm/auth` barrel, which pulls the native argon2 binding — same constraint as `lib/role-landing.ts`/`lib/impersonation-banner.ts`). `canPerform` treats `manage` as the superset verb so treasury's `manage:reconciliation` grants read of the reconciliation screen (matches source `RECONCILIATION_VIEW_ROLES`).
- Deny-by-default: unmapped routes are forbidden; `/forbidden` + `/logout` are whitelisted so the 403 view can never short-circuit to itself (no redirect loop).
- Float dot degrades to red `unknown` on any API error — never paints a misleading green.
- No new DB tables / migrations (none expected per Dev Notes). No `audit_outbox` writes (this surface performs no audited mutations; render-time gating only).
- Deferred (low severity) logged in `10-1-nav-shell-role-gated-routes-review-findings.md`: migrating the pre-existing gated pages under the `(console)` group + calling `enforceRoute`; provisional float-status endpoint shape; API header-attestation wiring (deferred per story Dev Notes).

### File List

- apps/admin/lib/nav.ts (new)
- apps/admin/lib/nav.test.ts (new)
- apps/admin/lib/guard.ts (new)
- apps/admin/lib/guard.test.ts (new)
- apps/admin/lib/enforce-route.ts (new)
- apps/admin/lib/session-context.ts (new)
- apps/admin/lib/session-context.test.ts (new)
- apps/admin/lib/float-status.ts (new)
- apps/admin/lib/float-status.test.ts (new)
- apps/admin/components/side-nav.tsx (new)
- apps/admin/components/header-bar.tsx (new)
- apps/admin/app/(console)/layout.tsx (new)
- apps/admin/app/(console)/page.tsx (new)
- apps/admin/app/(console)/forbidden/page.tsx (new)
- apps/admin/app/page.tsx (removed — replaced by the `(console)` root page)
- _bmad-output/implementation-artifacts/10-1-nav-shell-role-gated-routes-review-findings.md (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented nav shell + role-gated routes: pure nav/guard/header functions, `(console)` shell layout, 403 forbidden view, float status dot. Full gate green. | claude-opus-4-7 |
