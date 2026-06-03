# Review findings — P5-E04-S04 (public review snippets — optional)

Sweep review 2026-06-03. Epic commit. **No code patch (all findings are product/legal/CDN decisions).**
The core is sound: admin hand-picks 5-star comments, the attribution is anonymised + always editable,
publish/unpublish are `manage config`-gated + audited + CSRF-protected, the public read filters
`published_at IS NOT NULL` (a retracted snippet stops returning from the DB immediately), is
rate-limited + 1h-cached, and exposes only quote + anonymised attribution (no parentId/name/phone). I
confirmed the public homepage render path HTML-escapes the snippet (no stored XSS).

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Retracted snippet keeps serving from CDN/browser cache for up to 1h after unpublish.**
  The public response is `Cache-Control: public, max-age=3600` with no `must-revalidate`/surrogate-key
  purge, so a takedown (a parent withdrawing consent) propagates only after the TTL — the route's own
  docstring claims "no stale cache serving a retracted snippet," which the header contradicts. Shorten
  max-age + `must-revalidate`, or emit a surrogate key and purge on unpublish.
- **[Decision][MED] The quote is published VERBATIM from the parent's free-text comment, with no
  redaction and no post-curation quote edit** (only the attribution is editable). A 5-star comment that
  itself contains a child's name / the parent's name / a phone number goes public verbatim — the only
  safeguard is the admin reading it. Add a quote-edit field (so PII can be scrubbed without re-curating)
  and/or a phone/email heuristic warning at curation.
- **[Decision][LOW] No parent consent / opt-in** is recorded before publishing their words publicly
  (admin-driven only). In-spec per the AC, but a Kenya-DPA/GDPR consideration — confirm the feedback
  terms cover public re-use, or add a per-feedback consent flag.

## Deferred / tracked
- **[Defer][LOW] Per-IP rate limiter collapses to one bucket behind a proxy** (`trustProxy` unset) —
  app-wide pattern shared with staff-earnings; fix once at the app level, not here.

## Dismissed
public response exposes only quote + anonymised attribution (no PII columns); HTML-escaped on the homepage; publish/unpublish RBAC + audit; 5-star-only curation.
