# How to resume this code-review sweep (after a usage-limit reset or fresh session)

The sweep is **fully resumable** from durable on-disk state. To continue:

1. Read `progress.json` in this folder.
   - `epic_state` maps epic → `todo`/`done`. Resume at the **first epic not `done`**, in
     numeric order (the `meta.epic_order` array is the canonical order; Epic 10 is excluded —
     already fully reviewed).
   - `epic_results` holds per-epic tallies already committed.
2. For the resume epic, list its pending stories: `stories[]` where `epic == N` and
   `classification == "pending"`. For each, check `findings/<id>.json`:
   - **If the findings file exists**, that story was already reviewed — reuse it, don't re-spawn.
   - **If missing**, spawn a fresh reviewer agent (see `REVIEWER-BRIEF.md`) for it.
3. Triage → auto-apply unambiguous `patch` fixes → write `<key>-review-findings.md` →
   append any `decision-needed` to `DECISIONS-NEEDED.md` → verify (typecheck/test touched
   packages) → `git commit` the epic → `update_progress.py N <patches> <defer> <decisions> <dismissed>`
   → update the row in `SUMMARY.md`.
4. Repeat until all epics are `done`, then run the Final task: present `DECISIONS-NEEDED.md`.

## Operating parameters (locked with the user)
- **Scope:** Epics 1–36, skip already-reviewed (have `*-review-findings.md`) & no-code stories. 128 stories.
- **Fix mode:** auto-apply unambiguous patches; **collect** decision-needed (do not auto-fix); defer pre-existing.
- **Persistence:** commit per epic; review each story against its **pinned commit SHA** (immutable — safe even if HEAD moves).
- **Test-gaps policy:** missing-test findings are logged in review-findings as tracked follow-ups, not written inline.
- Commit message convention: `chore(review/P{phase}-E{nn}): ...`. End with the Co-Authored-By trailer.

## Get a single epic's review inputs
```
python3 - <<'PY'
import json
N=2  # epic number
p=json.load(open('_bmad-output/implementation-artifacts/code-review-sweep/progress.json'))
for w in p['stories']:
    if w['epic']==N and w['classification']=='pending':
        print(w['id'],'|',w['title']); print('  spec:',w['spec']); print('  impl:',w['impl_file'])
        print('  commits:',' '.join(w['commits']),'(',w['commit_level'],')')
PY
```
