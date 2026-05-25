# Review findings — 15-4-ci-cd-pipelines-per-app (X8-S04)

Single self-review pass. No BLOCKER/high-severity issues found; the full gate
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`) is green.

## Deferred (lower severity / follow-up)

- **[low] Placeholder release seams.** `infra/deploy.sh` and `infra/preview.sh`
  are intentionally stubs that echo + assert `DEPLOY_TOKEN`. The concrete
  platform release/preview commands (container registry, host, DNS) belong to
  the deploy story, per this story's Dev Notes ("the concrete target is wired by
  the deploy story; the gate ordering is what matters"). Wire real targets when
  that story lands.
- **[low] `migrate:deploy` has no applied-migration ledger.** `applyMigrations`
  re-runs every numbered `.sql` file each deploy. Migrations are additive-only
  and most use `IF NOT EXISTS`, but a dedicated `schema_migrations` ledger (skip
  already-applied files) would be safer at scale. Tracked for the deploy story.
- **[info] YAML parser is a deliberate subset.** `@bm/ci-tooling`'s parser
  covers only the constructs our workflows use (nested maps, block/flow
  sequences, inline flow maps, comments). It is unit-tested against the real
  workflow files; if workflows adopt anchors/multi-doc YAML, swap in a real
  `yaml` dependency.
