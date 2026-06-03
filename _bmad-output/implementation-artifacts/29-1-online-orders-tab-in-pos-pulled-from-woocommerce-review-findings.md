# Review findings — P4-E04-S01 (online orders tab in POS)

Sweep review 2026-06-03. Epic-level commit (pinned SHA is the per_page fix). Authz clean (`read
product`, parents excluded); idempotent re-pull (`onConflictDoUpdate` on `woo_order_id`, local_status
preserved); per_page pagination fix verified. AC1–AC6 met & tested. No code change.

## Decision needed / deferred (see DECISIONS-NEEDED.md)
- **[Decision][LOW] Order money stored as raw Woo decimal string, not `total_cents`** (spec note says
  cents). Display-only (no arithmetic, per the locked no-wallet decision) — reconcile code vs spec.
- **[Defer] Pull pins no `orderby`** — could drop orders if a single run exceeds `MAX_PAGES`.

## Dismissed
parseModified UTC consistent; chime ref no race; MAX_PAGES infinite-loop guard sound.
