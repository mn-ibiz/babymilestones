# Review findings — P4-E05-S01 (event creation)

Sweep review 2026-06-03. Epic-level commit. Authz correct (`manage service`, admin-only; reception
403); capacity + price as integer cents (DB CHECK ≥0); additive migrations; audited. AC1–AC3 met & tested.

## Deferred / tracked (all low)
- **[Defer] Concurrent same-name event create → 500 not 409** (slug SELECT outside the insert tx).
- **[Defer] Tier sale window (`saleStartsAt`/`saleEndsAt`) accepted without ordering/in-event-window
  validation** — matters once S03 reads them.
- **[Defer] `event.created` audit non-atomic** (bare db; codebase-wide pattern).

## Dismissed
created-by FK absence (intentional); PATCH null-handling; tier immutability (S01 scope); DB window CHECK backstop.
