# Review findings — P1-E09-S01 (SMS adapter interface + stub)

Sweep review 2026-06-03 (blind + edge + acceptance). Reviewed against commit `b70f51f1`.
**✅ Clean — no defects.** AC1–AC3 implemented & tested (76 SMS tests pass).

## Confirmed correct
- Provider-agnostic `SmsSender.send({to,template,data})→{id}` seam + `createSmsSender` config switch;
  the P5-E03 `LiveSmsAdapter` later slots in behind the same interface with no call-site changes —
  strongest evidence the seam is right.
- `StubSmsSender` renders via the template registry, inserts a `queued` `sms_outbox` row, makes no
  network call, returns the row id. Additive migration 0034.
- No PII in logs (no `console`/`logger` calls; bodies land only in the DB row; OTP audit logs ip/ua only).

## Dismissed
OTP code in `data` jsonb (pre-existing — body already held it); `row!.id` defensive assertion; dead
`reason:"no_consent"` branch (from the later P1-E05-S06 fix); additive NOT NULL DEFAULT; test drift.
