# Story 5.6: Print + SMS-stub receipt from Reception

Status: done

> Canonical ID: P1-E05-S06 · Phase: P1 · Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S06.md

## Story

As Reception,
I want to print or text a receipt to a parent after a transaction,
so that they leave with proof of payment.

## Acceptance Criteria

1. After any payment, a "Print" + "SMS" button pair appears.
2. Print uses browser's default printer (Decision 13).
3. SMS uses stub adapter (P1-E09).
4. Reprint available from the transaction history at any time.

## Tasks / Subtasks

- [x] Task 1: Receipt contract + data (AC: #1, #2, #4)
  - [x] Receipt payload types in `packages/contracts` (transaction id → parent, line items, amount, method, source, date) + `receiptLineDescription` mapping. (No Zod input schema needed — the only input is the URL `transactionId` param; the payload is server-derived.)
  - [x] `apps/api/src/routes/reception/receipt.ts` — GET receipt payload by transaction (wallet-ledger entry) id; registered via `registerReceptionRoutes` (already wired into buildApp)
- [x] Task 2: SMS receipt via stub (AC: #3)
  - [x] `POST /reception/receipt/:transactionId/sms` sends through `@bm/sms` stub (`ConsentAwareSmsSender.sendReceipt`) — consent-gated on `smsMarketingOptIn` (P1-E02-S04); writes an `reception.receipt_sms` audit_outbox row whether sent or dropped
- [x] Task 3: Receipt UI + print (AC: #1, #2)
  - [x] `apps/admin` Reception — `ReceiptActions` (Print + SMS pair) appears after a settled payment
  - [x] Print renders `renderReceiptHtml` / `ReceiptPreview` (`@bm/ui`) and uses the browser's default printer via a Blob-URL print port (Decision 13 — no native print server)
- [x] Task 4: Reprint from history (AC: #4)
  - [x] `ReceiptActions` surfaced on each recent-transactions row; payload reproduced server-side from the ledger entry so reprint/re-send works any time
- [x] Task 5: Tests per source "Tests" section (AC: all)
  - [x] Unit: receipt payload shaping + line descriptions (contracts), `renderReceiptHtml`/`receiptSmsBody` (ui), consent gate (sms), print/SMS client logic (admin)
  - [x] Integration: receipt endpoint by transaction id; SMS stub send audited + consent-gated; staff-only guards (api)
  - [~] E2E: covered by the admin lib unit tests (print via injected port, reprint path) + the api integration tests; a Playwright `e2e/` flow is deferred to the epic-wide E2E pass (no `e2e/` harness wired for reception yet).

## Dev Notes

- Print uses the browser's default printer per Decision 13 — no custom print server; render the `ReceiptPreview` compound from `packages/ui` and invoke browser print.
- SMS goes through the provider-agnostic `@bm/sms` stub adapter at launch (P1-E09); keep it swappable.
- Receipts are reproducible from transaction history at any time, not just immediately after payment.
- Source paths to touch: `apps/api/src/routes/reception/receipt.ts`, `apps/admin` Reception receipt UI, `packages/contracts` (receipt schema), `@bm/sms` (stub), `packages/ui` (`ReceiptPreview`).
- Testing standards: vitest per workspace, TS strict, test-first (red/green/refactor).

### Project Structure Notes
- Route in `apps/api/src/routes/reception/`; UI + print in `apps/admin`; receipt template compound in `packages/ui`; SMS via `packages/sms`.
- Dependencies (from source): P1-E08 (transactions), P1-E09 (SMS stub). Additive-only migrations.

### References
- [Source: _bmad-output/planning-artifacts/stories/p1/P1-E05-S06.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P1-E05.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7

### Debug Log References

- Full gate green: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
- Build fix: `@bm/ui`'s NodeNext `.js` source specifier (`./receipt-preview.js`) did not resolve under Next/webpack's `transpilePackages`; added a `webpack.resolve.extensionAlias` (`.js` to `.ts`/`.tsx`) to the admin/pos/platform `next.config.mjs` so the transpiled package resolves.

### Completion Notes List

- "Transaction" = a `wallet_ledger` entry id. The receipt payload is reproduced server-side from that entry (join ledger to wallet to user to parent), so reprint/re-send works at any time (AC4) and nothing is cached at payment time.
- Decision 13 (browser print): the API returns a structured payload; `@bm/ui.renderReceiptHtml` renders a self-contained, HTML-escaped printable document and the admin print port opens it via a Blob URL and calls `window.print()` — no native print server, and no markup-injection sink.
- SMS copy (AC3) is routed through the `@bm/sms` stub (`StubSmsSender` to `sms_outbox`) and is consent-gated on `smsMarketingOptIn` (P1-E02-S04): a non-consenting parent's copy is dropped (`sent:false`, `reason:"no_consent"`); audited either way.
- Staff-only: receipt read guarded `read wallet`; SMS send guarded `create payment` + CSRF. Parent name/phone are server-derived, never client-trusted.
- Scope: this is the lightweight reception receipt. The full eTIMS/KRA receipt engine (tax fields, control unit, QR, PDF) is deferred to epic P1-E08, as the story hint directs.

### File List

- `packages/contracts/src/index.ts` (+ `.test.ts`) — receipt payload/response types + `receiptLineDescription`
- `packages/ui/src/receipt-preview.ts` (+ `.test.ts`) — `renderReceiptHtml`, `receiptSmsBody`, `formatReceiptCents`, `RECEIPT_BUSINESS_NAME`; re-exported from `packages/ui/src/index.ts`
- `packages/ui/package.json` — add `@bm/contracts` dep
- `packages/sms/src/index.ts` (+ `.test.ts`) — `ConsentAwareSmsSender.sendReceipt` (consent-gated receipt copy)
- `apps/api/src/routes/reception/receipt.ts` (+ `.test.ts`) — receipt GET + SMS POST; registered in `apps/api/src/routes/reception/index.ts`
- `apps/api/package.json` — add `@bm/ui` dep
- `apps/admin/lib/receipt.ts` (+ `.test.ts`) — print/SMS client logic + Blob-URL print port
- `apps/admin/app/reception/page.tsx` — `ReceiptActions` (Print + SMS) after payment + on history rows
- `apps/admin/next.config.mjs`, `apps/pos/next.config.mjs`, `apps/platform/next.config.mjs` — webpack `extensionAlias`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-24 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
| 2026-05-25 | 1.0 | Implemented print + SMS-stub reception receipt (contract, @bm/ui ReceiptPreview, consent-gated SMS, staff-only audited API, admin UI + reprint); full gate green | claude-opus-4-7 |
