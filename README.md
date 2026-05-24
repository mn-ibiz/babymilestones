# Baby Milestones

Unified baby-care platform (Kenya). Single Node/TS API, single PostgreSQL shared
schema, Next.js front-ends, pnpm + Turborepo monorepo. The online toy shop is a
**standalone WooCommerce** site (Decision 37) — not in this repo.

## Layout
- `apps/api` — single API surface (Fastify), all business logic + webhooks
- `apps/platform` — public landing + authed parent dashboard (Next.js)
- `apps/pos` — in-store POS; WooCommerce order pull + stock push (Next.js)
- `apps/admin` — admin / Reception / Treasury / RBAC console (Next.js)
- `apps/jobs` — Node worker (SMS retry, commission run, anonymisation, recovery, Woo sync)
- `packages/{db,wallet,payments,catalog,sms,auth,ui,contracts,config}` — shared libraries
- `infra/` — docker-compose (Postgres + Redis), env templates

## Develop
```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres + Redis
pnpm dev          # all apps via turbo
pnpm test         # all workspaces
pnpm lint && pnpm typecheck
```

Source of truth: `Baby-Milestones-Spec.md` v2.1 · `_bmad-output/planning-artifacts/`.
