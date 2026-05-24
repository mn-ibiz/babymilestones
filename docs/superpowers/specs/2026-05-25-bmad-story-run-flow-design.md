# BMAD Story Run Flow — Design

**Date:** 2026-05-25
**Status:** Approved for planning

## Purpose

Automate implementation of the BMAD story queue end-to-end. For each story the
flow runs the full BMAD process — `bmad-dev-story` then `bmad-code-review` —
fixes blocking issues, then moves to the next story in a **fresh context
window**. Each story is reviewed **exactly once**; no story is ever re-reviewed.

## Requirements

- Process every story currently at status `ready-for-dev`.
- Per story: implement (`bmad-dev-story`) → review once (`bmad-code-review`) →
  fix blocking findings → advance.
- **One review pass per story. Never re-review a story** — in this run or any
  future run.
- Clear/fresh context between stories.
- Run until the `ready-for-dev` queue is empty.

## Architecture

A reusable slash command **`/run-stories`** at `.claude/commands/run-stories.md`.
Invoked once, the **main session is a thin orchestrator**: it selects stories,
dispatches one subagent per story, reads back a short structured report, and
logs. The orchestrator performs no dev or review work itself — this keeps the
main context small and gives every story a genuinely fresh context window via
its own subagent (satisfies "clear the context window between stories"
structurally, without relying on `/clear`).

Maps onto the `superpowers:subagent-driven-development` pattern.

### Components

| Component | Location | Purpose |
|---|---|---|
| `/run-stories` command | `.claude/commands/run-stories.md` | Orchestrator loop + embedded subagent prompt template |
| Sprint status | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Source of truth for queue + status transitions |
| Run log | `_bmad-output/implementation-artifacts/run-log.md` | Append-only audit trail, one line per story processed |
| Deferred findings | `_bmad-output/implementation-artifacts/<story>-review-findings.md` | Lower-severity findings logged for later (NOT a re-review trigger) |

## Data flow

### Orchestrator loop

```
load sprint-status.yaml
queue ← stories with status "ready-for-dev", in file order (epic 1→12, story order)
for each story in queue:
    dispatch ONE subagent (fresh context) with the story key
    wait for structured report
    append report line to run-log.md
    if report = FAILED:
        set story status → "blocked" in sprint-status.yaml, log reason
        CONTINUE to next story            # skip-and-continue
    # on success the subagent has already set status → "done"
when queue empty:
    print summary (done / blocked counts + blocked story list)
    stop
```

No per-run cap; runs until queue is empty.

### Per-story subagent (runs exactly once)

1. Run `bmad-dev-story` for the assigned story key → implement to completion;
   status advances to `review`.
2. Run `bmad-code-review` **exactly once** on that story's changes.
3. Triage findings:
   - **Fix blocker/high-severity inline.**
   - Write all lower-severity findings to
     `<story>-review-findings.md`. This file is a follow-up log only — it MUST
     NOT trigger another review.
4. Set story status → `done` in sprint-status.yaml.
5. Return a structured report:
   `STORY | RESULT(done|failed) | findings_fixed | findings_deferred | failure_reason`
6. Constraints baked into the prompt: **never** loop its own review, **never**
   re-review, **never** pick up a second story. One story, then exit.

## "No double review" guard (two layers)

1. **Subagent-level:** instructed to run review exactly once and never
   re-review.
2. **Orchestrator-level:** only ever selects `ready-for-dev` stories. A
   processed story is `done` or `blocked`, so it can never be re-selected in
   this or a future run. `run-log.md` is the audit trail.

## Failure handling — skip and continue

If `bmad-dev-story` hits a HALT condition, tests/build cannot be made green, or
the subagent errors:

- Mark the story `blocked` in sprint-status.yaml with the reason logged.
- **Continue** to the next story.
- Because stories have dependencies, a blocked early story may cascade into
  blocked dependents; the final summary surfaces all blocked stories so the
  cascade is visible.

## Out of scope (YAGNI)

- Per-run story cap (run until empty).
- Automatic re-review or multi-pass review.
- Resolving deferred (lower-severity) findings — captured for later, not acted
  on here.
- Story creation (`bmad-create-story`) — stories already exist at
  `ready-for-dev`.

## Success criteria

- Running `/run-stories` processes the entire `ready-for-dev` queue unattended.
- Each processed story has: completed implementation, exactly one recorded
  review, blocking findings fixed, a `run-log.md` entry, and status `done` or
  `blocked`.
- No story is reviewed more than once.
- A failing story does not stop the run; it is marked `blocked` and reported.
