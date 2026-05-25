# Deploy & One-Click Rollback Runbook (X8-S04)

Covers the CI/CD pipelines and how to roll a bad release back. Pairs with the
DB backup/restore runbook (`infra/backup-restore-runbook.md`).

## Pipeline overview

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `.github/workflows/ci.yml` | every PR + push to `main` | `verify` job (lint + typecheck + test) then a per-app `build` matrix (`api`, `platform`, `pos`, `admin`, `jobs`). |
| `.github/workflows/preview.yml` | PR opened/synced/closed | spins up one preview env per PR (`pr-<number>`), tears it down on close. |
| `.github/workflows/deploy.yml` | push to `main` | gated `migrate` job applies `packages/db` migrations, then a per-app `deploy` matrix runs — every deploy job `needs: migrate`. |

The deploy is **fail-closed**: if the `migrate` job fails, no `deploy` job runs,
so the platform never serves code against an un-migrated schema.

## One-click rollback

Migrations are additive-only (no destructive `DROP`/`ALTER ... DROP`), so the
previous app build is always compatible with the current schema. Rollback is
therefore a pure app-version revert — no DB downgrade needed.

### Option A — re-run a known-good deploy (preferred, one click)

1. Open **Actions → Deploy** in GitHub.
2. Find the last successful `Deploy` run on `main` (the green one before the bad
   release).
3. Click **Re-run all jobs**. This re-runs `deploy.yml` from that commit,
   re-releasing the prior app versions. The `migrate` job is a no-op (those
   migrations are already applied), and each per-app `deploy` job ships the
   known-good build.

### Option B — revert the merge commit

1. `git revert -m 1 <bad-merge-sha>` and merge the revert PR to `main`.
2. The push to `main` triggers `deploy.yml`, which redeploys the reverted code.

## Rehearsal (AC #4)

Rehearse before go-live and after each pipeline change:

1. Deploy a trivial, safe change to `main` and confirm all `deploy` matrix jobs
   go green.
2. Trigger Option A: re-run the prior successful `Deploy` run and confirm each
   app returns to the previous version (check `/healthz` build metadata per app).
3. Trigger Option B in a staging context: revert the trivial change and confirm
   the redeploy succeeds.
4. Record the drill (date, run IDs, outcome) in the ops log.

Recovery objective: restore the prior known-good release within minutes via the
re-run path, with zero schema changes required.
