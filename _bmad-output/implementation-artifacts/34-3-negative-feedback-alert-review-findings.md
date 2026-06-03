# Review findings — P5-E04-S03 (negative feedback alert)

Sweep review 2026-06-03. Epic commit. **One patch applied. ✅ Privacy clean.** The ≤2 → in-app alert +
ops SMS path is correct: boundary (0,2 yes; 3 no) tested, in-app row idempotent via UNIQUE
(type,source,id), and — verified per Epic 31 — the SMS carries only rating + generic UNIT label + a
relative link, NEVER the parent's identity / the discreet service name / the comment text. Alert
list+dismiss is RBAC-gated (reception 403), no IDOR.

## Patched this review
- **[Patch][MED] SMS + audit now fire AT-MOST-ONCE via a claim-then-act.** Previously the `alerted_at`
  stamp ran AFTER an unconditional `sender.send()` + `audit()`, so a second worker tick (the in-app row
  is guarded by UNIQUE but the side effects were not) would double-send the paid SMS + double-audit.
  Reordered to claim the row first (`UPDATE … SET alerted_at WHERE id=? AND alerted_at IS NULL
  RETURNING`); a 0-row claim `continue`s, so only the winning run sends. jobs(14) green.
- **[Patch][LOW] Scan now filters `submitted_at IS NOT NULL`** to match its documented "submitted
  feedback" contract (was relying implicitly on the rating-NULL-until-submit invariant). Regression test
  added.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] The ops SMS is unbatched/unthrottled** — a wave of low ratings = one paid SMS per
  rating to the single ops number (cost + alert fatigue). Choose a per-run digest / SMS cap (in-app
  stays one-per-feedback) / per-window throttle.
- **[Decision][LOW] "Within 5 minutes" is the cron cadence, not realized latency** (worst case ≈ the
  full 5-min interval). Use a tighter cadence, alert at submit-time, or document "by the next tick".

## Deferred / tracked
- **[Defer][LOW] `alerts.admin_phone` is not E.164-validated** before send — belongs in the settings
  write path, not this job.

## Dismissed
PII in SMS (rating+unit+link only, no name/discreet-name/comment); alert RBAC + dismiss idempotent, no IDOR; ≤2 boundary.
