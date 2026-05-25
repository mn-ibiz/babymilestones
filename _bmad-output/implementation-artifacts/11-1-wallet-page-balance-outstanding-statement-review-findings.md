# Review findings — P1-E11-S01 (parent wallet page)

Single self-review pass. No BLOCKER/high-severity findings. The following
lower-severity items are deferred (follow-ups), not fixed in this story.

## Deferred (low severity)

1. **Bank-transfer top-up handoff is a dangling anchor.** `TOP_UP_METHODS`
   points bank at `/top-up#bank`, but the `/top-up` page has no bank section
   (bank top-up is currently admin-confirmed via the API — no parent self-serve
   surface yet). The link still lands on `/top-up`; the `#bank` fragment is a
   no-op. The real top-up flow + bank rail belong to **P1-E11-S03** (top-up flow
   from the dashboard), which should own the method picker handoff end-to-end.
   M-Pesa (`#mpesa-heading`) and card (`#card-heading`) anchors are correct.

2. **Loyalty points hardcoded to 0.** There is no loyalty points ledger/table in
   P1 (only `loyalty` earn-rate *settings* exist). Per the story, loyalty is
   earn-only / display-only in P1, so the wallet overview reports `0`. When an
   earning ledger lands, `registerParentWallet` should read the real balance
   instead of the constant.

3. **Statement window is a fixed trailing 12 months.** The "View full statement"
   button downloads the last 12 months (the sync window). A date-range picker
   (and async >12-month handling beyond the existing "pending" message) is out of
   scope here; the P1-E03-S08 export already supports arbitrary ranges if a
   picker is added later.
