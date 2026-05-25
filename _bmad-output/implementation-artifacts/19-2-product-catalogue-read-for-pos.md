# Story 19.2: Product catalogue read for POS

Status: backlog

> Canonical ID: P2-E04-S02 · Phase: P2 · Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S02.md

## Story

As cashier,
I want to search or scan a product and add it to a sale,
so that the capability described above is delivered.

## Acceptance Criteria

1. Barcode scanner input auto-focused; on enter → matches `products.sku` or `products.barcode`.
2. Search by name with debounce; results show price, stock.
3. Out-of-stock products greyed out (sale blocked at checkout).

## Tasks / Subtasks

- [ ] Task 1: Implement Product catalogue read for POS (AC: #1, #2, #3)
  - [ ] Satisfy AC#1: Barcode scanner input auto-focused; on enter → matches `products.sku` or `products.barcode`.
  - [ ] Satisfy AC#2: Search by name with debounce; results show price, stock.
  - [ ] Satisfy AC#3: Out-of-stock products greyed out (sale blocked at checkout).
  - [ ] Touch / create: `packages/catalog`
- [ ] Task 2: Tests (AC: all)
  - [ ] Test-first with vitest (`pnpm test`); cover each AC (unit / integration / e2e as appropriate)

## Dev Notes

Uses `packages/catalog`. Catalogue itself created in P4-E01 — for P2 ship a minimal stub seed product set.

Testing standards: vitest (`pnpm test`), TS strict, test-first. Migrations additive-only. Audited actions write to `audit_outbox`.

### Project Structure Notes
- Dependencies (from source): S01.
- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in `apps/*`, shared logic in `packages/*`, migrations in `packages/db`.

### References
- [Source: _bmad-output/planning-artifacts/stories/p2/P2-E04-S02.md]
- [Spec: Baby-Milestones-Spec.md v2.1] and [Epics: _bmad-output/planning-artifacts/epics.md] § P2-E04.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-25 | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
