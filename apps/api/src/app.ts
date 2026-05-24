import Fastify, { type FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import { LoginRateLimiter, type SessionStore } from "@bm/auth";
import { registerAuthRoutes } from "./routes/auth/index.js";

export interface AppDeps {
  db?: Database;
  sessions?: SessionStore;
  /** Shared failed-login limiter (P1-E01-S02). Defaults to a fresh in-memory one. */
  rateLimiter?: LoginRateLimiter;
}

/** Build the single API surface that serves all front-end apps. */
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ status: "ok" }));

  if (deps.db && deps.sessions) {
    registerAuthRoutes(app, {
      db: deps.db,
      sessions: deps.sessions,
      rateLimiter: deps.rateLimiter ?? new LoginRateLimiter(),
    });
  }

  return app;
}
