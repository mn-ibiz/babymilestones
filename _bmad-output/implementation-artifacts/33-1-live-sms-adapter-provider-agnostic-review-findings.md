# Review findings — P5-E03-S01 (live SMS adapter — provider-agnostic)

Sweep review 2026-06-03. Epic commit (merge `f3ca875`). **No code patch (every finding is a decision or
a deferred/dead-code item).** The adapter implements the contract, re-runs the SSRF guard before each
call, uses bearer auth via an injected transport (no network from defaults), and records
status/messageId/cost. AC1–AC4 tested. SSRF guard covers the metadata endpoint + the previously-fixed
IPv4-compat IPv6 gap.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Live send trusts transport-level 2xx blindly.** A provider (e.g. Africa's Talking)
  can return HTTP 200 with a per-recipient `InsufficientBalance`/`UserInValidPhoneNumber` body — the
  adapter records that as `status='sent'` (messageId null), so a NOT-accepted message never enters the
  retry path. Add a provider-aware success predicate (parse the recipient status / Twilio status), or
  treat a null messageId on a 2xx as a soft failure. Per-provider acceptance contract = product call.

## Deferred / tracked
- **[Defer][HIGH] Retry worker has no DB-level claim before the HTTP send** → double-send (real money)
  under multi-instance / crash mid-tick. Safe ONLY under the documented single-worker scheduler; becomes
  a live risk once the live adapter is wired + the worker scaled. Pre-existing (P3-E06-S04).
- **[Defer][MED] LiveSmsAdapter & the retry worker don't compose** — `send()` INSERTS a new outbox row
  each call; there's no row-based re-dispatch, so wiring `resend` to `send` would duplicate rows +
  double-send. Flag so the S02 wiring adds a `resendOutbox(row)` path instead of reusing `send()`.
- **[Defer][LOW] SSRF guard doesn't decode NAT64/6to4/SIIT-wrapped private IPv4** in IPv6 literals
  (operator-pinned config, metadata endpoint already blocked → low real risk).

## Dismissed
SSRF guard applied per-call; metadata + IPv4-compat IPv6 blocked; secrets env-sourced; integer-cent cost.
