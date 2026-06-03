# Review findings — P2-E06-S01 (settings for backup retention policy)

Sweep review 2026-06-03. Commit `992c2946` (epic). Admin-only (`manage config`, 401/403 tested);
min-retention guard (`dailyKeep>=1` — can't nuke all backups, tested); audit + single-row settings
storage; Zod strips unknown keys. AC1/AC3 met. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Admin retention page is a static 11-line shell** — no form/fetch/submit; the
  tested `parseRetentionForm`/`describeRetentionPolicy` helpers are unused by the UI. AC2 met at the
  API, but a human admin can't edit via the shipped UI. Intentional shell, or ship the client?
- **[Decision][LOW] No upper bounds** — `graceDays: 999999999` is accepted and would disable the S02
  pruner forever. Lower (destructive) bound is handled; decide sane `.max()` caps.

## Deferred / tracked
- **[Defer] PUT save + audit non-atomic** (pre-existing settings pattern); audit records no before/after.

## Dismissed
GET gated by manage config (stricter, not a hole); updated_by FK; unknown-key injection (Zod strips).
