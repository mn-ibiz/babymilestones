---
description: Orchestrate the BMAD ready-for-dev story queue — one subagent per story, single review, skip-and-continue, until the queue is empty.
---

# /run-stories — BMAD Story Queue Orchestrator

You are a **thin orchestrator**. You do NO dev or review work yourself. You
select stories, dispatch **one subagent per story** (fresh context), read back a
short structured report, log it, and advance. Source of truth is
`_bmad-output/implementation-artifacts/sprint-status.yaml`.

Design ref: `docs/superpowers/specs/2026-05-25-bmad-story-run-flow-design.md`.

## Orchestrator loop

1. Read `_bmad-output/implementation-artifacts/sprint-status.yaml`.
2. Build the queue: every story key with status `ready-for-dev`, in file order
   (epic 1→15, story order). Ignore `epic-*`, `*-retrospective`, and any story
   already `in-progress`/`review`/`done`/`blocked`.
3. Ensure `_bmad-output/implementation-artifacts/run-log.md` exists (create with
   a header if not).
4. For each story key in the queue, **sequentially** (never in parallel — stories
   share files and the git tree):
   a. Dispatch ONE subagent (general-purpose) with the per-story prompt below,
      substituting the story key + its file path.
   b. Wait for the structured report line.
   c. Append the report line to `run-log.md`.
   d. If `RESULT=failed`: set the story's status to `blocked` in
      `sprint-status.yaml` with the reason; **continue** to the next story.
   e. If `RESULT=done`: the subagent has already set status `done` and committed.
5. When the queue is empty: print a summary (done / blocked counts + the list of
   blocked stories so dependency cascades are visible) and stop.

No per-run cap. Run until the queue is empty. Never re-select a `done`/`blocked`
story — that is the "no double review" guarantee at the orchestrator level.

## Per-story subagent prompt (template)

> You implement and review EXACTLY ONE story, then exit. Never pick up a second
> story. Never re-run your own review.
>
> **Repo:** `/Users/linuxlab/Desktop/PROD/Baby-Care` — pnpm + Turborepo monorepo.
> **Story key:** `<KEY>`  · **Story file:** `_bmad-output/implementation-artifacts/<KEY>.md`
>
> **Foundations already built (reuse, don't recreate):**
> - `@bm/db` — Drizzle single shared schema; tables exported; `audit(executor,{...})`
>   helper; `Database`/`Transaction` types; migrations in `packages/db/migrations/*.sql`
>   (additive-only, numbered). DB tests use the PGlite harness: `import { createTestDb } from "@bm/db/testing"`.
> - `@bm/auth` — `normalizePhone`, `isValidPinFormat`/`isWeakPin`/`hashPin`/`verifyPin`,
>   `InMemorySessionStore`/`SessionStore`, `serializeSessionCookie`, `SESSION_COOKIE_NAME`.
> - `@bm/config` — `tokens` + `tailwind.preset.cjs`. `@bm/ui` re-exports tokens.
> - `apps/api` — Fastify; `buildApp({ db, sessions })` registers routes; `/healthz` exists;
>   auth routes under `apps/api/src/routes/`.
> - `apps/jobs` — `register({name,run})` in `src/registry.ts`.
> - Next apps `apps/{platform,pos,admin}` extend the Tailwind preset.
>
> **Process (do all, in order):**
> 1. Read the story file fully + its source planning spec (path in the story's References).
> 2. Set `<KEY>` and its `epic-N` to `in-progress` in `sprint-status.yaml`.
> 3. Implement **test-first** (red → green → refactor). Follow the story's Tasks/ACs.
>    Anchor to the real scaffold paths. Migrations additive-only. DB-backed tests use
>    `createTestDb()` (PGlite). Hook-safety: prefer `String.match(...)` over the
>    `RegExp` `.exec` method, and never write a literal `child_process` exec call.
> 4. Run the FULL gate from the repo root until all green:
>    `pnpm test && pnpm typecheck && pnpm lint && pnpm build`.
>    If you cannot make it green (HALT/blocker), STOP: set `<KEY>` → `blocked` in
>    sprint-status with a one-line reason, report `RESULT=failed`, and exit. Do not commit broken code.
> 5. **Review exactly once**: self-review the diff for correctness, security, and AC
>    coverage. Fix BLOCKER/high-severity findings inline (re-run the gate). Write any
>    lower-severity findings to `_bmad-output/implementation-artifacts/<KEY>-review-findings.md`
>    (a follow-up log — do NOT re-review or act further). Never run a second review.
> 6. Update the story file: check completed tasks `[x]` (mark deferred items `[~]` with a
>    reason — never claim untested work), fill Dev Agent Record (model, debug log,
>    completion notes, File List), append a Change Log row, set `Status: done`.
> 7. Set `<KEY>` → `done` in `sprint-status.yaml` (update `last_updated`).
> 8. Commit all changes with a Conventional-Commit message
>    `feat(<area>): <CANONICAL_ID> <title>` + a short body, ending with the
>    `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
> 9. Return ONLY this line:
>    `STORY <KEY> | RESULT(done|failed) | fixed=<n> | deferred=<n> | reason=<text-or-none>`
>
> Constraints: ONE story. ONE review. Never re-review. Never start a second story. Exit after the report.

## Notes
- Use git author `Baby Milestones <dev@babymilestones.co.ke>` if no git identity is set.
- The orchestrator may spot-check the gate but performs no implementation itself.
