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
import { InMemoryExportStorage, runExport, type ExportStorage } from "@bm/export";
import { registerAuthRoutes } from "./routes/auth/index.js";
import { registerParentRoutes } from "./routes/parents/index.js";

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
  /** Signed-URL S3-equivalent store for export ZIPs (P1-E02-S05). Defaults in-memory. */
  exportStorage?: ExportStorage;
  /**
   * Enqueue a data-export job (P1-E02-S05). Defaults to fire-and-forget
   * processing via `runExport` so the request returns immediately (AC2). Tests
   * inject a deterministic synchronous variant.
   */
  enqueueExport?: (exportId: string) => void;
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
    const db = deps.db;
    const exportStorage = deps.exportStorage ?? new InMemoryExportStorage();
    const now = deps.now ?? Date.now;
    const enqueueExport =
      deps.enqueueExport ??
      ((exportId: string) => {
        // Fire-and-forget: generation is async (AC2). Errors are recorded on the
        // row by runExport; swallow here so the request path is unaffected.
        void runExport(exportId, { db, storage: exportStorage, now }).catch(() => {});
      });
    registerParentRoutes(app, {
      db,
      sessions: deps.sessions,
      exportStorage,
      enqueueExport,
      now,
    });
  }

  return app;
}
