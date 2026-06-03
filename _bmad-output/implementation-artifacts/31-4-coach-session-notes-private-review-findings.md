# Review findings — P5-E01-S04 (coach session notes — private)

Sweep review 2026-06-03. Epic commit. Most security-sensitive story in the epic. **✅ Core security
sound + one patch applied.** Notes are AES-256-GCM column-encrypted (reusing `@bm/woocommerce` crypto),
the decrypted read path is gated on `read audit` (admin/super_admin) + audited, the parent has NO
surface, and the 24-month anonymise cron NULLs the ciphertext + owner ids (idempotent, tested). The
public coach viewer is deliberately CONTENT-FREE (counts + dates only) — verified it never returns the
plaintext or the encrypted envelope.

## Patched this review
- **[Patch][LOW] Public coach-summary route now validates the UUID shape before querying.** A non-UUID
  `:staffId` hit the `uuid` column → Postgres `22P02` → a 500 + errorTracker capture on every junk
  request to this UNAUTHENTICATED anti-scrape endpoint. Added the same inline UUID guard the sibling
  `staff-earnings` viewer uses (404 on malformed). Added a focused test file
  (`coaching-notes-summary.test.ts`, 3 tests) asserting the 404 + that no content envelope crosses.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC2 "named coach can read their own notes" is not delivered.** The only DECRYPTED
  surface is the admin `read audit` route (returns ALL coaches' notes, unscoped); the public coach
  viewer is content-free. `listCoachingSessionNotesForCoach` (coach-scoped decrypt) exists, is tested,
  but is **unwired dead code**. The dev's rationale (a coach has no login; the name-picker is
  internet-reachable, so decrypted content there would leak) is a defensible reading — but the
  coach-visibility half of AC2 is functionally absent. Decide: (A) accept summary-only + delete the
  dead decrypt path, or (B) wire a reception-mediated coach-scoped decrypted view (never public).
- **[Decision][LOW] AC1 "after check-out" not enforced** — `recordCoachingSessionNote` checks only that
  the booking is a coaching session, never `bookings.status`. A note can attach to a confirmed/
  cancelled/no-show booking. Decide whether check-out is a hard precondition.

## Dismissed
encryption at rest (AES-256-GCM, per-record nonce); no parent surface; anonymise idempotent + tested; audited reads.
