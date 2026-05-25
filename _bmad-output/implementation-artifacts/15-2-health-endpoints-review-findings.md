# X8-S02 Health endpoints — review findings (follow-ups)

Single self-review completed 2026-05-25. No BLOCKER/high-severity issues; the
items below are lower-severity follow-ups deferred for a later story.

## Deferred (low severity)

1. **Live Redis readiness probe is not wired.** AC1 names Redis as a readiness
   dependency. Redis is provisioned in `infra/docker-compose.yml`, but there is
   no Redis client anywhere in the application code yet (no `redis`/`ioredis`
   dependency, no `REDIS_URL` consumer). Rather than fabricate a connection, the
   implementation exposes the *mechanism*: `buildApp({ redisPing })` adds a
   `redis` readiness probe when a ping fn is injected, and `registerHealthRoutes`
   / `createHealthServer` accept arbitrary named `checks`. When a real Redis
   client lands (its own story), wire `redisPing: () => client.ping()` — no code
   change to the health surface is required. The generic probe path is already
   covered by tests (db + redis "ok"/"fail"/timeout cases).

2. **Jobs worker boot does not yet start `createHealthServer`.** The factory and
   readiness evaluator are implemented, exported, and tested over real HTTP, but
   `apps/jobs/src/index.ts` does not call `createHealthServer(...).listen(port)`
   on boot because the worker has no DB wiring at boot today (the boot shim
   registers nothing until real infra is injected with the deploy story, per the
   existing comment in `index.ts`). Start the health server alongside that infra
   wiring so the probe reflects the worker's real dependencies.

3. **Next app readiness probes the API liveness only.** The parent/POS/admin
   apps hold no DB/Redis connection of their own (they call the API), so their
   readiness probes the upstream API `/health/live`. `API_BASE_URL` defaults to
   `http://127.0.0.1:8080`; confirm/parameterise that against the real
   deploy topology when the deploy story lands.
