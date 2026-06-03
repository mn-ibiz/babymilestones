# Review findings — P5-E06-S03 (CMS-driven unit pages)

Sweep review 2026-06-03. Epic commit. **One hardening patch applied. ✅ Stored-XSS guard verified
COMPLETE.** The prior fix (CTA href + hero image scheme guard) holds: `isSafeCmsUrl` is an ALLOWLIST
(empty / root-relative / explicit http(s) only) applied at write-schema + catalog + render layers,
robust to `javascript:`/`data:`/`vbscript:`/case/whitespace/encoding variants; all text fields render as
escaped JSX. Admin CRUD/publish `manage config`-gated + audited; the public route serves published-only;
revisions retained on every save+publish. Closes the Epic 12 deferred `[unit]` dynamic-route item — the
route 404s unknown units and can't be path-injected.

## Patched this review
- **[Patch][LOW] `fetchPublishedUnitPage` now `encodeURIComponent`s the slug** into the CMS fetch URL
  (defense-in-depth — the `[unit]` route can't carry a `/`, but a route param should never be
  interpolated raw). platform cms-page(21) green.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][HIGH] CMS external hero image breaks at render.** The schema accepts absolute http(s)
  hero URLs (the documented primary use case) but `[unit]/page.tsx` renders via `next/image` and
  `next.config.mjs` configures NO `images.remotePatterns` → Next 400s any remote host. Functional (not
  security) AC1 gap. Decide: allowlist the approved CDN host(s), restrict hero URLs to root-relative
  local paths, or render external absolute URLs with a plain `<img>` / `unoptimized`.

## Deferred / tracked
- **[Defer][LOW] `getPublishedPage` revision tiebreak uses random UUID** (not a monotonic sequence) —
  non-deterministic only if two revisions share `created_at`, unreachable via current flows.

## Dismissed
stored-XSS allowlist (verified complete, all layers); authz (manage config + audited); published-only public read; revisions retained.
