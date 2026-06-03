# Code Review Sweep — Running Summary

**Scope:** Epics 1–36, skip already-reviewed (42 stories) & no-code stories. **128 stories to review.**
**Mode:** auto-apply unambiguous patches; collect decision-needed; commit per epic.
**Review baseline:** each story reviewed against its pinned commit SHA(s) — immutable, concurrency-safe.

Legend: ✅ done · ⏳ in progress · ⬜ todo

| Epic | Stories | State | Patches applied | Deferred | Decisions needed | Dismissed |
|------|---------|-------|-----------------|----------|------------------|-----------|
| 1  | 3 | ✅ | 1 (argon2id cost) | 7 | 3 | 9 |
| 2  | 3 | ✅ | 4 (walk-in URL blocker, error handling, ageInMonths, name caps) | 1 | 1 | 14 |
| 3  | 4 | ✅ | 3 (top-up double-pay BLOCKER, idempotency floatId, replay guard) | 3 | 4 | 14 |
| 4  | 3 | ✅ | 3 (cron state-guard, paystack err-log, bank diff-parent 409) | 3 | 2 | 10 |
| 5  | 2 | ✅ | 5 (reception IDOR ×3, receipt txn-SMS, receipt abs-amount) | 1 | 3 | 5 |
| 6  | 1 | ✅ | 1 (CSV formula-injection guard, repo-wide ×3) | 1 | 2 | 4 |
| 7  | 3 | ✅ | 2 (price one-open-row index+lock, staff no-op audit) | 3 | 0 | 11 |
| 8  | 2 | ✅ | 2 (receipt parentId FK, void 409) | 3 | 2 | 6 |
| 9  | 2 | ✅ | 1 (SSRF IPv4-compat IPv6 guard) | 0 | 0 | 9 |
| 11 | 1 | ✅ | 0 (code sound) | 2 | 0 | 3 |
| 12 | 1 | ✅ | 0 (security clean) | 1 | 2 | 4 |
| 13 | 2 | ✅ | 1 (audit() atomicity JSDoc) | 2 | 3 | 7 |
| 14 | 2 | ✅ | 2 (phantom @bm/config dep ×3, formatChildAge NaN) | 3 | 1 | 8 |
| 15 | 1 | ✅ | 3 (last-backup BLOCKER, fail-alert, prunedAt) | 1 | 0 | 3 |
| 16 | 7 | ✅ | 2 (reception-book BLOCKER IDOR, cancel double-fee lock) | 8 | 6 | 28 |
| 17 | 6 | ✅ | 2 (plan-price BLOCKER, reception sub/cancel IDOR ×2) | 7 | 12 | 15 |
| 18 | 5 | ✅ | 5 (photoUrl XSS, check-in IDOR, handoff IDOR, date-500, accented anonymise) | 2 | 2 | 16 |
| 19 | 5 | ✅ | 2 (POS sales + cash-up IDOR BLOCKERs) | 5 | 7 | 19 |
| 20 | 4 | ✅ | 2 (redeem double-spend BLOCKER+replay, rate tiebreaker) | 1 | 8 | 12 |
| 21 | 2 | ✅ | 0 (data-safety core PASS) | 3 | 4 | 7 |
| 22 | 3 | ✅ | 0 (code clean) | 3 | 5 | 9 |
| 23 | 5 | ✅ | 4 (commission double-pay BLOCKER, rate lock, mark-paid idemp, csv-injection test) | 3 | 6 | 15 |
| 24 | 2 | ✅ | 1 (public viewer malformed-id 500→404) | 2 | 1 | 8 |
| 25 | 5 | ✅ | 2 (salon counter IDOR BLOCKER, resync cancelled-slot) | 4 | 5 | 15 |
| 26 | 4 | ⬜ | | | | |
| 27 | 5 | ⬜ | | | | |
| 28 | 5 | ⬜ | | | | |
| 29 | 7 | ⬜ | | | | |
| 30 | 5 | ⬜ | | | | |
| 31 | 5 | ⬜ | | | | |
| 32 | 4 | ⬜ | | | | |
| 33 | 4 | ⬜ | | | | |
| 34 | 4 | ⬜ | | | | |
| 35 | 6 | ⬜ | | | | |
| 36 | 5 | ⬜ | | | | |

## Notes / observations
- Repo advanced mid-session (HEAD `19d412b` → `35272a5`); a concurrent process completed Epics 35–36. Reviewing by pinned SHA isolates us from further movement.
