# Review findings — P3-E05-S03 (top-staff leaderboard)

Sweep review 2026-06-03. Epic-level commit. **✅ Essentially clean.** Reassign-SAFE by construction
(reads `bookings.staffId`/`staffRateSnapshot` directly — a reassign mutates only the booking's staffId,
so one booking = one service under the current stylist; no ledger join, no double-count — unlike the
P3-E02-S02 earnings breakdown). Integer math (divide-by-zero guarded), authz tested, no PII. AC1–AC3 met.

## Deferred / tracked
- **[Defer] No explicit reassign regression test** (safe by construction; add a test for coverage).
- **[Defer] Revenue is GROSS** (refunds not netted), unlike S02 — label or net; out of S03 scope.

## Dismissed
gross-revenue (AC-aligned); useEffect([]) initial load; inactive staff in roster (intentional).
