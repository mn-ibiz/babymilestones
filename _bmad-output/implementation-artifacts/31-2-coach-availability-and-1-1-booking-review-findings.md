# Review findings — P5-E01-S02 (coach availability and 1:1 booking)

Sweep review 2026-06-03. Epic commit. **✅ Concurrency-safe & clean.** AC1–AC5 implemented & tested.
The headline concurrency target is HANDLED: `bookCoachingSlot` takes a `SELECT … FOR UPDATE` on the
slot row inside the tx, so two parents racing the same 1:1 slot → second rejected (`coaching.ts`).
Pending-invoice + price-snapshot reuses the shared P2-E01 settle path. No IDOR (parent-scoped).

## Deferred / tracked
- **[Defer][MED] coaching-reminders declares `cron: "0 18 * * *"` but the scheduler is intervalMs-only**
  — fires every 24h from worker boot, not at 18:00. The target *day* is recomputed each run so the
  reminder still goes to tomorrow's bookings; only the wall-clock hour is illusory. **Known systemic
  repo gap** (the single-worker scheduler never parses cron) — track centrally, not per-story.
- **[Defer][LOW] coaching-slot-generation omits a `cron` descriptor** (intervalMs only) — registry
  shows `cron: null`; cosmetic observability parity with the reminders job. Matches salon-generator.
- **[Defer][LOW] A slot earlier *today* (wall-clock passed) is still listable/bookable** — availability
  filters by date granularity only; no past-time guard. **Pre-existing, shared with salon/sessions** —
  fix uniformly across booking surfaces, not just here.

## Dismissed
double-booking race (FOR UPDATE present); loyalty-on-settle (correctly reused, out of scope).
