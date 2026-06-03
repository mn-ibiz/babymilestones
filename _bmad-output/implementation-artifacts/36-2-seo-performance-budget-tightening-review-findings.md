# Review findings — P5-E06-S02 (SEO + performance budget tightening)

Sweep review 2026-06-03. Epic commit. **No code patch. ✅ JSON-LD XSS verified SAFE.** Canonical/OG/
Twitter metadata + LocalBusiness/Article JSON-LD on all public pages, well tested. The reviewer confirmed
`serializeJsonLd` escapes `<` → `<`, so an attacker-influenced string (article title, CMS name,
testimonial) can't break out of the `<script type="application/ld+json">` context — NOT a defect.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] AC1 (Lighthouse 95+ Perf/SEO/A11y) and AC3 (LCP < 1.5s on 3G-fast) have no automated
  enforcement.** No lhci gate in CI; `LCP_BUDGET_MS=1500` + `withinLcpBudget()` are referenced only by
  their own unit test — nothing measures a real LCP. So both perf/quality ACs are aspirational and can
  silently regress. Add a Lighthouse CI budget gate, or explicitly waive the DoD "every AC has a test"
  for these two and accept manual acceptance.

## Deferred / tracked
- **[Defer][LOW] No `app/sitemap.ts` / `app/robots.ts`** shipped with the SEO pass — standard SEO assets,
  not named in the ACs. Add as a follow-up (sitemap enumerating units + published article slugs) or
  confirm tracked elsewhere.

## Dismissed
JSON-LD `<`-escaping (verified, no `</script>` breakout); metadata built from safe text; no open-redirect canonical.
