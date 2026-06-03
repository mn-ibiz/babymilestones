# Review findings — P3-E06-S01 (job framework: scheduling + observability)

Sweep review 2026-06-03. Epic-level commit. `job_runs` ledger (AC2) + super-admin run-now (AC4)
correct & tested; scheduler-path `captureException` works (AC3). No code change (findings are the
framework decision).

## Decision needed (see DECISIONS-NEEDED.md — consolidated)
- **[Decision][HIGH · framework] Scheduler ignores declared `cron`, runs purely on `intervalMs`.** No
  cron parser exists in `apps/jobs`; `job.cron` is decorative (surfaced in the admin UI — misleading).
  So calendar-aligned jobs drift and never fire at the declared time: the monthly commission run uses
  `intervalMs=30 days` (≠ a calendar month, slides earlier each cycle, resets on restart), and daily
  jobs (backup `0 2 * * *`, anonymise, reminders) fire every 24h from boot at an arbitrary hour. Wire a
  cron scheduler, or drop/relabel the cron field. This is the root of the cron findings flagged in
  Epics 15, 18, 22, 23. `apps/jobs/src/runner.ts:145-164`.
- **[Decision][HIGH] Admin "run now" failures aren't sent to the error tracker** (AC3 gap on the manual
  path) — the run-now route re-implements the lifecycle inline and only logs/records `job_runs`, never
  `captureException`. Thread the existing `errorTracker` in, or delegate to `runJob`. `apps/api/.../admin/jobs.ts:179-193`.

## Deferred / tracked
- **[Defer] `onFailure` policy declared but never enforced** by the scheduler (every job re-fires next tick).
- **[Defer] No distributed lock** — overlap guard is per-process; >1 replica double-fires (single-instance P3 scope).

## Dismissed
job_runs ledger + super-admin run-now gating correct and tested.
