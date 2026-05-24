# Review findings — P1-E03-S06 (admin refund reversing entry)

Single self-review pass. No BLOCKER/high-severity findings; gate is green
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`). All five ACs plus
role enforcement, audit, and idempotency are covered by tests.

## Low-severity / deferred (follow-up log only — not acted on)

- **L1 — SMS delivery is best-effort.** `notifyParent` failures are swallowed
  (`.catch(() => {})`) so a queue/stub error never undoes the committed
  reversing entry. This matches the existing export route's fire-and-forget
  pattern and is the correct money-vs-notification trade-off, but there is no
  retry/dead-letter for a failed refund SMS. Acceptable for the P1 stub
  (real provider + retry is P1-E09); revisit when the provider adapter lands.
- **L2 — Refund target is not constrained to debits.** The primitive reverses
  the sign of whatever original entry is named, so a (nonsensical) refund
  against a credit would post a debit. In practice the admin UI selects a debit
  (AC1), and remaining-refundable math is sign-agnostic, so this is not a
  correctness bug today. A later guard could reject non-debit originals if the
  UI ever allows free selection.
- **L3 — No explicit cross-wallet/“is this entry refundable” business rules
  beyond amount.** e.g. refunding an already-reversed `reversal` entry is not
  specially blocked. Out of scope for this story (reason/amount/role only).
