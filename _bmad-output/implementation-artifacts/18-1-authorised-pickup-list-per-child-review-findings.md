# Review findings — P2-E03-S01 (authorised pickup list per child)

Sweep review 2026-06-03. Commit `49b4a5ab`. IDOR clean (ownership session→parent→child, 404 on
mismatch, tested); audit in-tx. **Fixed a stored-XSS BLOCKER.**

## Patched this review
- **[Patch][BLOCKER] `photoUrl` accepted `javascript:`/`data:`/protocol-relative URLs** (length-only
  validation) — shown on the attendant screen → stored XSS on a child-safety surface. Added an
  `isSafeCmsUrl` refine (the established guard) to `pickupAuthorisationSchema.photoUrl`. contracts/api typecheck + pickups tests green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] Audit payload omits changed values** (phone/photoUrl/before-after) on a
  safety-critical list — an investigator can't tell what changed. Privacy-vs-traceability call.

## Dismissed
No role guard on `/parents/me/*` (ownership enforced); full-replace PATCH (UI sends full draft); no
server-side fetch of photoUrl (no SSRF); raw audit action strings (matches pattern).
