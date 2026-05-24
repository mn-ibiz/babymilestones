# Review findings — P1-E02-S05 parent data export

Single self-review pass. No BLOCKER/high-severity issues found; the items below
are lower-severity follow-ups deferred to their owning epics/stories.

## Deferred (low severity)

1. **Object storage is in-memory, not a real S3-equivalent.** `InMemoryExportStorage`
   stands in for the signed-URL bucket. The `ExportStorage` interface is the seam:
   a real adapter (S3/MinIO + presigned URLs) drops in without touching routes or
   the job. Belongs with the deploy/infra story.

2. **Async enqueue is fire-and-forget in `buildApp` default.** Generation is
   "async" via a detached `runExport` promise. A durable queue / the `apps/jobs`
   `data-export` worker (already implemented + tested) should drain
   `data_exports.status = 'pending'` on a schedule once the jobs runtime is wired
   to a live DB. The worker exists; only its boot wiring (DATABASE_URL + store) is
   pending.

3. **bookings / wallet ledger / receipts are empty arrays.** Those tables are not
   yet in the schema (P1-E03 ledger + the bookings epic are not done). The export
   bundle includes stable, documented empty arrays for them so the ZIP shape does
   not change when those datasets land — at which point `gatherParentExport`
   should be extended to populate them. Task 2 sub-item marked `[~]` in the story.

4. **Download serves bytes through the API, not a redirect to a signed URL.**
   With the in-memory store there is no external URL to redirect to, so the
   endpoint streams the ZIP directly. When real signed URLs exist, the download
   endpoint can 302 to the presigned URL after consuming the single-use token.
