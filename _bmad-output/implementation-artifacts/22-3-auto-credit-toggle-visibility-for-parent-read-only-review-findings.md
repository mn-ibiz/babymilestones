# Review findings — P2-E07-S03 (auto-credit toggle visibility for parent — read-only)

Sweep review 2026-06-03. Commit `d098318a` (epic). **✅ Security clean.** AC1–AC3 met & tested.

## Confirmed correct
- **No IDOR / read-only.** The parent reads auto-credit via `GET /parents/me/wallet`, resolved
  `eq(wallets.userId, auth.user.id)` from the session — never a param. The P1-E03-S07 admin-GET IDOR
  does NOT apply to this parent-facing read. There is NO write path on this surface; the only mutation
  is the `manage wallet`-gated admin PATCH (parents can't reach it). The component is presentational.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] `autoCreditStatusViewModel` is dead code** — the wallet page wires the `@bm/ui`
  component directly, bypassing the (tested) viewmodel, so two parallel copies of the AC1/AC2 copy
  exist. Wire the page through the viewmodel, or delete it.

## Dismissed
page passes `autoCreditEnabled` raw but guards `!wallet` first (always boolean); UI/endpoint in sibling commits (wired in tree).
