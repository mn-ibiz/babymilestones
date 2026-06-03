# Review findings — P5-E03-S04 (template editor — admin)

Sweep review 2026-06-03. Epic commit (merge `f3ca875`). **No code patch.** Versioning is correct
(new version, prior retained, single active via partial unique index, transactional, audited);
missing-required-placeholder validation (AC2) works and is tested; admin-gated by `manage config`.

NOTE: I drafted an "unknown-placeholder" guard (reject any `{token}` the template can't bind) to stop a
stray placeholder bricking the send path — but **reverted it**: the system as-tested explicitly allows an
admin to ADD new placeholders (the `topup.success` test adds `{balanceKes}`), and the seeded body is not
a reliable allowed-set (orphan keys have no renderer). The safe fix needs a real per-key allowed-
placeholder catalogue derived from each renderer's data bag → collected as a decision below.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] Editor accepts UNKNOWN placeholders → a stray `{token}` bricks that send path.**
  Validation only checks the required set isn't dropped, never that added tokens are bindable.
  `interpolateTemplate` is fail-closed (THROWS on an unbound token); for `auth.reset.code` (data bag
  `{code}` only, send NOT wrapped in try/catch) a saved `{name}` 500s every password reset for all
  users. **Fix needs a per-key allowed-placeholder catalogue** (the renderer data bag) to validate
  against on save — that catalogue must be defined first. Alternatively make `interpolateTemplate`
  fail-soft (leave unknown tokens literal), but that's its own behaviour change.
- **[Decision][MED] Only 7 of 21 template keys are editable** — `PUT` 404s on any key not seeded into
  `sms_templates`; the other 14 (booking/coaching/subscription/outstanding/pickup/event/feedback/…)
  keep hardcoded copy. The "edit SMS bodies without code changes" JTBD is only partly met. Seed all
  renderer keys, allow create-on-first-edit, or scope the story to the 7 transactional keys.
- **[Decision][MED] No SMS segment / GSM-7-vs-UCS-2 validation** — only a 1600-char cap. One emoji
  forces UCS-2 (70 chars/segment) → silent multi-segment cost fan-out at go-live. Add a segment
  estimator + warn/limit.

## Deferred / tracked
- **[Defer][LOW] No URL allowlist for literal URLs in template bodies** (phishing) — admin-gated + audited.
- **[Defer][LOW] Orphan seeded key `topup.success`** is editable but never sent (misleads the admin).

## Dismissed
versioning correctness (single active, prior retained, tx); missing-placeholder AC2; admin RBAC + audit.
