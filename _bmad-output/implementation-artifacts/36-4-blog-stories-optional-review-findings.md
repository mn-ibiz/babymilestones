# Review findings — P5-E06-S04 (blog / stories — optional)

Sweep review 2026-06-03. Epic commit. **No code patch. ✅ Stored-XSS verified SAFE (the classic blog-body
sink included).** The body renders through a custom escape-first markdown SUBSET (`renderArticleMarkdown`)
— NOT MDX/HTML: every run is HTML-escaped before transform, link hrefs allowlisted to http(s)/mailto, and
the reviewer probed ~13 vectors (script tags, img/onerror, attribute breakout, `JaVaScRiPt:`, tab/
control-char-smuggled + HTML-entity schemes) with no bypass. `coverImageUrl` scheme guard verified an
allowlist at all three layers. The NEW middleware change (added `BLOG_RE` to the public allowlist) is
sound: anchored single-segment regex, no open-redirect / header-injection / auth-bypass. Admin CRUD
`manage config`-gated + audited; public serves published-only (draft 404 + list-exclusion tested);
kebab-case + unique slug.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][LOW] Unpublish/takedown is served stale up to 5 min via the public `max-age=300` cache.**
  Fine for SEO; for a legal/defamatory takedown the body stays publicly retrievable from cache after the
  editor believes it's gone. Accept + document the SLA, lower max-age, or `no-store` the detail route.
- **[Decision][LOW] AC1 says body is "MDX" but the impl is a safe markdown subset** — a deliberate,
  correct security tradeoff (MDX = arbitrary component execution = stored XSS). Confirm the subset
  satisfies intent and update the AC wording; do NOT add real MDX on a public admin-authored surface.

## Deferred / tracked
- **[Defer][MED] PRE-EXISTING: platform middleware redirects `/health/live` + `/health/ready` probes to
  `/login`** (not allowlisted). NOT introduced by this story (middleware predates it; this story only
  added `BLOG_RE`). Track separately — add a `/health` bypass to `isPublicPath`/the matcher.

## Dismissed
body stored-XSS (escape-first markdown subset, ~13 vectors probed, no bypass); coverImageUrl allowlist; middleware sound; authz + published-only; slug validation.
