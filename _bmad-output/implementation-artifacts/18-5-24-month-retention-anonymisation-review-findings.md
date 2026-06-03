# Review findings — P2-E03-S05 (24-month retention + anonymisation)

Sweep review 2026-06-03. Commit `6b3fad30` (epic-level). Cutoff math correct (strictly-older,
month-end clamped, UTC-safe), idempotent (`anonymisedAt` filter), atomic PII-strip + audit, no
starvation. AC1/AC3/AC4 tested. **Fixed a data-privacy BLOCKER.**

## Patched this review
- **[Patch][BLOCKER · PII] Name scrub left accented/non-ASCII names un-redacted.** `anonymiseNote`
  used ASCII `\b` word boundaries (JS `\b` is ASCII-only even under `/u`), so "José", "Zoë", "Élodie",
  "Òmar" passed through unchanged — PII surviving anonymisation, irreversibly and silently. Replaced
  with `\p{L}\p{N}_` lookaround boundaries. Added an accented-name regression test. jobs(14) green.

## Deferred / tracked
- **[Defer] Declared cron `0 2 * * *` not honoured** — scheduler runs off `intervalMs` (every 24h
  from boot). Pre-existing P3-E06 framework limitation; no correctness impact (idempotent).

## Dismissed
Cutoff math; idempotency; atomic PII-strip+audit; failed-row exclusion; soft-delete owner-resolution unreachable.
