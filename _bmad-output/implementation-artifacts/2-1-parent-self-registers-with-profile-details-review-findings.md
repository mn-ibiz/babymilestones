# Review findings — P1-E02-S01 (2-1-parent-self-registers-with-profile-details)

Single self-review pass. No BLOCKER/high-severity findings; the gate is green
(`pnpm test && pnpm typecheck && pnpm lint && pnpm build`). Lower-severity items
deferred below as follow-ups (not acted on further).

## Deferred (low severity)

1. **No render-level tests for the platform UI components/pages.**
   `ProfileForm`, `CompletionBanner`, `/profile`, and `/welcome/profile` are
   covered indirectly via the pure helpers (`validateDraft`,
   `shouldShowCompletionBanner`, `draftFromProfile`) and the API integration
   tests, but there are no React Testing Library tests asserting the rendered
   form/skip/banner behaviour. The platform app has no jsdom/RTL harness wired
   yet. Add one when the parent dashboard shell (P1-E11) lands and a testing
   harness is set up for the surface.

2. **Live SSO role resolution depends on the in-memory session store.**
   `/parents/me` resolves the user live via `resolveUser` against `users`, but
   the prod Redis session store is still deferred (per P1-E01-S04 Dev Notes).
   No action needed here — inherited platform decision.

3. **Profile route is parent-agnostic on role.** Any authenticated user (incl.
   staff) could currently create a `parents` row for their own user id. In v1
   staff use a separate flow and the surface is parent-only; a `requirePermission`
   / role guard could be added if staff-on-platform ever becomes possible.
