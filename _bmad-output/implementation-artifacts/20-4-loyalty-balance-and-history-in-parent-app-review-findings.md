# Review findings — P2-E05-S04 (loyalty balance and history in parent app)

Sweep review 2026-06-03. Commit `789c9d41` (epic). IDOR clean (wallet from session; P3 clawback rows
keyed by parentId with null walletId can't leak into the walletId-filtered reads); balance =
earned − redeemed (tested); integer cents. AC1/AC3 met. No code change (findings are decisions).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] History silently truncated at 100 rows** — route hardcodes `limit:100`, no
  pagination, no `hasMore`/total; an append-only ledger grows forever so older history is unreachable
  with no signal. Plumb limit/offset (or cursor) + `hasMore`. (`getLoyaltyHistory` already clamps to
  [1,200] — reconcile the 100 vs 200.)
- **[Decision][LOW] AC2 "source link" is a plain text label** — API returns `sourceId` but the
  view-model drops it (no click-through). Confirm whether a navigable link is intended.

## Deferred / tracked
- **[Defer] No loyalty page render test** (helpers + endpoint tested; consistent with declarative-page pattern).

## Dismissed
multi-wallet; negative-balance display; P3 row contamination; role check.
