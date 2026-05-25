# DB Backup & Restore Runbook (X8-S03)

Daily Postgres backups with a fixed **30-day retention** (Decision 35).

## How backups run

- The `db-backup` job (`apps/jobs/src/jobs/db-backup.ts`) runs on a daily cadence
  (`intervalMs = 24h`). It is registered in production via `registerDbBackupJob`
  once real infra (a `DATABASE_URL` + an off-host object store) is injected.
- Each run inserts a `backup_runs` row (`running` → `success`/`failed`) recording
  `started_at`, `finished_at`, `status`, off-host `location`, `size_bytes`, and
  `error`. Every run is recorded (AC3).
- The dump itself (pg_dump → off-host upload) is an **injected** dependency
  (`BackupDump`). Tests mock it; production wires a real implementation. No shell
  exec lives in the job.
- After each backup, the job prunes off-host snapshots whose `started_at` is more
  than 30 days old, deleting the object and stamping `pruned_at` (AC2).

## Production dump implementation (wiring sketch)

The injected `dump()` should, against the `postgres` service in
`infra/docker-compose.yml`:

```sh
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | <upload to off-host object store at off-host/$(date -u +%F).dump>
```

and return `{ location, sizeBytes }`. Store credentials come from the deploy
story; never hard-code them.

## Restore drill (AC4 — rehearse at commissioning)

Perform this manually before go-live and re-rehearse on each retention review:

1. Pick the most recent `success` row from `backup_runs`; note its `location`.
2. Download that snapshot from the off-host store to a scratch host.
3. Stand up a throwaway Postgres (e.g. `docker run --rm postgres:16-alpine`).
4. Restore:
   ```sh
   pg_restore --no-owner --dbname="$RESTORE_URL" <snapshot>
   ```
5. Verify row counts of key tables (`users`, `wallets`, `wallet_ledger`,
   `invoices`) against expectations and run smoke queries.
6. Record the drill outcome (date, snapshot location, result) in the ops log.
7. Tear down the throwaway database.

Recovery objective: restore from any snapshot within the 30-day window.
