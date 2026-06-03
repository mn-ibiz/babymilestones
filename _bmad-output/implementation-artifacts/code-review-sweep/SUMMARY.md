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
| 26 | 4 | ✅ | 1 (adjust reason persisted) | 2 | 3 | 6 |
| 27 | 5 | ✅ | 3 (active-session bound, outstanding guard, revenue range cap) | 3 | 6 | 14 |
| 28 | 5 | ✅ | 1 (commission fail-alert guard) | 4 | 5 | 8 |
| 29 | 7 | ✅ | 3 (stock lost-update BLOCKER, Woo SSRF BLOCKER, packing-slip print) | 6 | 6 | 18 |
| 30 | 5 | ✅ | 1 (door double-admit TOCTOU) | 2 | 3 (incl. payment-not-wired BLOCKER, capacity oversell race) | 9 |
| 31 | 5 | ✅ | 2 (public coach-summary UUID guard, discreet-label PATCH 400-not-500) | 5 | 6 | 16 |
| 32 | 4 | ✅ | 5 (VAT-fabrication BLOCKER, KRA blind-trust, queue CAS, retry cron, flag before/after audit) | 3 | 10 (incl. not-wired BLOCKER, producer-gap BLOCKER, AC2-not-rendered BLOCKER) | 12 |
| 33 | 4 | ✅ | 1 (admin go-live toggle credentials:include) | 5 | 13 (incl. switch-dead-code + cap-not-enforced + deferred-lost BLOCKERs) | 11 |
| 34 | 4 | ✅ | 6 (feedback-invite discreet leak, staff attribution, dashboard 366d cap, alert claim-then-act, submitted guard, index parity) | 4 | 6 | 15 |
| 35 | 6 | ✅ | 5 (tax-report month-breakdown bug, recurring-expense double-post, repeat+tax 366d caps, P&L audit tag) | 6 | 8 (incl. P&L shop-revenue BLOCKER, expense hard-delete) | 22 |
| 36 | 5 | ✅ | 1 (CMS slug encodeURIComponent) — all stored-XSS surfaces verified SAFE; 36-1/36-5 clean | 4 | 4 (CMS hero remote-image, Lighthouse gate, cache-takedown) | 19 |

## ✅ SWEEP COMPLETE — 35/35 epics, 128/128 pending stories reviewed (2026-06-03)

| Outcome | Total |
|---------|------:|
| Patches applied (with tests, committed per epic) | **77** |
| Decisions collected (in DECISIONS-NEEDED.md) | **149** |
| Deferred / tracked follow-ups | **114** |
| Dismissed (verified non-issues) | **401** |

**Headline BLOCKERs collected as decisions (NOT auto-fixed — product/security/finance calls):**
- **Events (30):** public ticket-confirm issues PAID tickets with NO payment rail; capacity oversell race.
- **eTIMS (32):** the writer-swap is unwired (flag ON does nothing); failed KRA submissions are LOST
  (producer gap); VAT/PIN metadata never renders + reprint immutability fork. *(VAT over-declaration on
  exempt lines, KRA blind-trust, and queue lost-update were PATCHED.)*
- **SMS Go-Live (33):** the live/stub flag and the spend cap are both unwired dead code; deferred
  messages are queued but never re-sent.
- **P&L (35):** consolidated P&L omits shop (POS) revenue while carrying shop expenses.

**Highest-value bugs PATCHED this sweep (examples):** wallet top-up / commission / loyalty double-pay
TOCTOUs; door check-in double-admit; Woo stock lost-update + SSRF; anonymise-PII Unicode gap; eTIMS
exempt-VAT over-declaration; tax-report mid-month breakdown (broke the default view); recurring-expense
double-post; feedback-invite discreet-billing leak + staff attribution; numerous IDOR/`isStaffRole`
gates, CSV formula-injection guards, and missing 366-day report caps.

**Method:** each story reviewed against its pinned commit SHA via parallel adversarial agents (Blind
Hunter / Edge Case Hunter / Acceptance Auditor). Unambiguous code-defect patches auto-applied WITH tests
and verified (typecheck + vitest) before the per-epic commit; ambiguous/architectural/product/compliance
items collected as numbered decisions; missing-test + systemic items deferred. Durable state for
resumability: `progress.json` + `findings/*.json` (125 files) + per-epic commits.

## Notes / observations
- Repo advanced mid-session (HEAD `19d412b` → `35272a5`); a concurrent process completed Epics 35–36. Reviewing by pinned SHA isolates us from further movement.
- Recurring patterns found: (1) several P5 "go-live/swap" features (eTIMS, SMS) ship fully-built but UNWIRED to production — unit tests pass by calling the selector directly; (2) report date-ranges repeatedly missed the 366-day cap convention; (3) UTC-vs-EAT day bucketing is a codebase-wide deferred decision; (4) single-worker scheduler means cron strings are decorative + claim-before-side-effect is the right idempotency pattern (applied across eTIMS/feedback/expenses).
