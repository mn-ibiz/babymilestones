import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import type { Database } from "@bm/db";
import {
  InMemoryConsumedTokenStore,
  LoginRateLimiter,
  ResetRateLimiter,
  type ConsumedTokenStore,
  type SessionStore,
} from "@bm/auth";
import { registerAuthRoutes } from "./routes/auth/index.js";

export interface AppDeps {
  db?: Database;
  sessions?: SessionStore;
  /** Shared failed-login limiter (P1-E01-S02). Defaults to a fresh in-memory one. */
  rateLimiter?: LoginRateLimiter;
  /** Per-phone reset-code limiter (P1-E01-S05). Defaults to a fresh in-memory one. */
  resetRateLimiter?: ResetRateLimiter;
  /** Single-use reset-token tracker (P1-E01-S05). Defaults to in-memory. */
  consumedTokens?: ConsumedTokenStore;
  /** HMAC secret for reset tokens. Defaults to a per-process random secret. */
  resetTokenSecret?: string;
  /** Clock injection for deterministic TTL/expiry tests. Defaults to `Date.now`. */
  now?: () => number;
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
      resetRateLimiter: deps.resetRateLimiter ?? new ResetRateLimiter(),
      consumedTokens: deps.consumedTokens ?? new InMemoryConsumedTokenStore(),
      resetTokenSecret:
        deps.resetTokenSecret ??
        process.env.RESET_TOKEN_SECRET ??
        randomBytes(32).toString("base64url"),
      now: deps.now ?? Date.now,
    });
  }

  return app;
}
