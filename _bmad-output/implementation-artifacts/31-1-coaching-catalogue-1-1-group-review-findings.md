# Review findings — P5-E01-S01 (coaching catalogue: 1:1 + group)

Sweep review 2026-06-03. Epic commit. **✅ Security clean.** AC1–AC4 implemented & tested: admin CRUD
gated by `manage service` + audited; coaching unit/format/duration/age-stage-tags/price all round-trip;
coach = staff record (no login). No IDOR, no early sensitivity leak.

## Decision needed (see DECISIONS-NEEDED.md)
- **[Decision][MED] Server contract doesn't enforce `format='group' ⇒ capacity>1`** — only the admin
  client form does (`services-form.ts:211`). A direct API `POST {format:'group', coachingCapacity:1}`
  is accepted; downstream treats it as a 1:1 hold. Add a cross-field `.refine` to
  serviceCreate/Update, or document group+1 as allowed and drop the client rule. (Same as 31-3.)
- **[Decision][LOW] Coaching attributes accepted on non-coaching units** — format/duration/capacity/
  tags aren't gated to `unit='coaching'` despite the schema comment claiming "only coaching offerings
  carry one." Enforce server-side or drop the false invariant.

## Dismissed
coaching unit CHECK already allowed since 0028; price via service_prices; audited mutations.
