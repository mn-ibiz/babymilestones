# Story 11.1: Wallet page (balance + outstanding + statement)

Status: done

> Canonical ID: P1-E11-S01 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S01.md

## Story

As a parent,
I want to see what's in my wallet and what I owe at a glance,
so that I always know my balance, outstanding, and recent activity.

## Acceptance Criteria

1. Hero: large wallet balance, smaller outstanding indicator (if > 0), auto-credit status indicator (read-only here — admin sets).
2. "Top up" CTA opens method picker (M-Pesa STK / Paystack card / Bank transfer).
3. Last 10 transactions visible; "View full statement" → CSV download.
4. Loyalty points balance shown read-only (earn-only in P1).

## Tasks / Subtasks

- [x] Task 1: Wallet read API in `apps/api` (AC: #1, #3, #4)
  - [x] Add route `apps/api/src/routes/parents/wallet.ts` (registered via `parents/index.ts`) returning balance, outstanding, auto-credit status, loyalty points, last 10 transactions — backed by `@bm/wallet` ledger primitives (`balance`, `recentTransactions`) + invoice sum
  - [~] Add full-statement CSV export endpoint — reused the existing P1-E03-S08 `GET /parents/me/statement` export rather than adding a duplicate endpoint (the wallet page links to it)
  - [x] Guard with `@bm/auth` (parent session); wallet resolved from session userId, never a param
- [x] Task 2: WalletBalanceCard compound (AC: #1)
  - [~] Built `WalletBalanceCard` as a React component in `apps/platform/app/components/` (not `packages/ui`) — `@bm/ui` is currently a React-free string-render package (X7 primitives not yet built), so a React compound cannot live there yet. The shared, testable render logic lives in the pure `apps/platform/lib/wallet.ts#walletHeroViewModel`, which reads the same balance/outstanding/auto-credit facts as the admin Reception header (`shapeProfileSummary`) for identical rendering.
- [x] Task 3: Wallet page in `apps/platform` authed route group (AC: #1, #2, #3, #4)
  - [x] Page under `apps/platform/app/(app)/wallet/page.tsx` using `WalletBalanceCard`, mobile-first
  - [x] "Top up" CTA opening method picker (M-Pesa STK / Paystack card / Bank transfer) — hands off to `/top-up` (P1-E11-S03 owns the full flow; bank anchor deferred — see review findings)
  - [x] Last-10 transactions list; "View full statement" triggering CSV download (reuses `downloadStatement`)
  - [x] Loyalty points balance shown read-only (0 — earn-only in P1, no points ledger yet)
- [x] Task 4: Tests (AC: all)
  - [x] Test-first vitest: API integration (`wallet.test.ts` — balance/outstanding/auto-credit/loyalty, last-10 newest-first + balance-after, own-wallet-only, 401, 404, empty) + platform pure-fn units (`wallet.test.ts` — KES formatting, outstanding hidden at 0, hero VM, transaction rows, top-up methods; `wallet-api.test.ts`). E2E deferred to the epic-11 shell story (P1-E11-S05).

## Dev Notes

- Parent dashboard surface lives in `apps/platform` authed route group (`apps/platform/app/(app)/wallet/`), mobile-first. Wallet data comes from `apps/api` calling `@bm/wallet` (ledger: balance/holds/FIFO). Shared `WalletBalanceCard` lives in `packages/ui` (primitives arrive in X7) and must render identically to the admin Reception header (per source Technical Notes).
- Auto-credit status is **read-only** here (admin sets it elsewhere). Loyalty is earn-only in P1 — display only.
- Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only.

### Project Structure Notes
- `apps/api/src/routes/wallet.ts`, `packages/ui` (`WalletBalanceCard`), `apps/platform/app/(app)/wallet/`.
- Depends on P1-E03, P1-E04, and X7 (`packages/ui` primitives) per source Dependencies. Top-up handoff aligns with P1-E11-S03.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E11-S01.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E11.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

Full gate green from repo root: `pnpm test` (API 379, platform 45), `pnpm typecheck`, `pnpm lint`, `pnpm build` (platform `/wallet` route emitted).

### Completion Notes List

- New read endpoint `GET /parents/me/wallet` returns the authed parent's OWN
  wallet overview (balance, outstanding, read-only auto-credit, loyalty points,
  last-10 transactions). Wallet is resolved from the session userId — never a
  param — so a parent can only read their own wallet. Reuses `@bm/wallet`
  (`balance`, `recentTransactions`) and the same invoice-sum rule as the admin
  Reception header for outstanding; auto-credit comes from `wallets` (read-only).
- New `WalletOverview` / `WalletOverviewResponse` contracts in `@bm/contracts`.
- View/formatting logic is pure + unit-tested in `apps/platform/lib/wallet.ts`
  (KES cents formatting, outstanding-visible rule, hero VM, transaction rows,
  top-up method list). The page (`app/(app)/wallet/page.tsx`) and
  `WalletBalanceCard` consume those pure fns.
- Loyalty is earn-only/display-only in P1 (no points ledger exists yet) → 0.
- Deviations: full-statement export reuses the P1-E03-S08 endpoint instead of a
  new one; `WalletBalanceCard` lives in `apps/platform` (React) not `@bm/ui`
  (string-only until X7). Both marked `[~]` in Tasks. Lower-severity follow-ups
  in `11-1-wallet-page-balance-outstanding-statement-review-findings.md`.

### File List

- `packages/contracts/src/index.ts` (added `WalletOverview` + `WalletOverviewResponse`)
- `apps/api/src/routes/parents/wallet.ts` (new)
- `apps/api/src/routes/parents/wallet.test.ts` (new)
- `apps/api/src/routes/parents/index.ts` (register wallet route)
- `apps/platform/lib/wallet.ts` (new — pure view logic)
- `apps/platform/lib/wallet.test.ts` (new)
- `apps/platform/lib/wallet-api.ts` (new — overview fetch client)
- `apps/platform/lib/wallet-api.test.ts` (new)
- `apps/platform/app/components/WalletBalanceCard.tsx` (new)
- `apps/platform/app/(app)/wallet/page.tsx` (new)
- `_bmad-output/implementation-artifacts/11-1-wallet-page-balance-outstanding-statement-review-findings.md` (new)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Parent wallet page implemented (API overview endpoint + pure view logic + page); gate green; reviewed once | claude-opus-4-7 |
