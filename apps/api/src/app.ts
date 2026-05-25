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
import { registerAdminRoutes } from "./routes/admin/index.js";
import { registerMpesaRoutes } from "./routes/payments/mpesa/index.js";
import type { MpesaRouteConfig } from "./routes/payments/mpesa/initiate.js";
import type { MpesaCallbackConfig } from "./routes/payments/mpesa/callback.js";
import { registerPaystackRoutes } from "./routes/payments/paystack/index.js";
import type { PaystackRouteConfig } from "./routes/payments/paystack/init.js";
import { registerCashRoutes } from "./routes/payments/cash/index.js";
import { registerBankRoutes } from "./routes/payments/bank/index.js";
import { registerReceptionRoutes } from "./routes/reception/index.js";

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
  /**
   * Enqueue an async wallet-statement generation for long (> 12 month) ranges
   * (P1-E03-S08). Defaults to a no-op handle; the worker that fulfils it lives
   * in `apps/jobs`. Tests inject a deterministic recorder.
   */
  enqueueStatement?: (input: {
    walletId: string;
    from: string;
    to: string;
    requestedBy: string;
  }) => void;
  /**
   * M-Pesa (Daraja) wiring for the STK push routes (P1-E04-S01). Daraja config +
   * an injected/mockable transport (tests pass a fake; production passes
   * `globalThis.fetch` + env credentials). When omitted, the payment routes are
   * not registered (no real network is ever attempted from config defaults).
   */
  mpesa?: MpesaRouteConfig;
  /**
   * M-Pesa C2B/STK callback handler config (P1-E04-S02): the Daraja source-IP
   * allowlist. Defaults to the published Safaricom ranges; tests pass `[]` to
   * disable the check (app.inject has no real Daraja client IP).
   */
  mpesaCallback?: MpesaCallbackConfig;
  /**
   * Paystack (card top-up) wiring for the init + verify routes (P1-E04-S04).
   * Secret-key config + an injected/mockable transport (tests pass a fake;
   * production passes `globalThis.fetch` + the env secret key). When omitted, the
   * Paystack routes are not registered (no real network is ever attempted).
   */
  paystack?: PaystackRouteConfig;
}

/** Build Paystack config from env (production). Returns null if not fully set. */
function paystackConfigFromEnv(): PaystackRouteConfig | null {
  const e = process.env;
  const config = {
    baseUrl: e.PAYSTACK_BASE_URL ?? "https://api.paystack.co",
    secretKey: e.PAYSTACK_SECRET_KEY ?? "",
    callbackUrl: e.PAYSTACK_CALLBACK_URL ?? "",
  };
  if (config.secretKey.trim() === "" || config.callbackUrl.trim() === "") return null;
  return { config, transport: (url, init) => fetch(url, init) };
}

/** Build Daraja config from env (production). Returns null if not fully set. */
function mpesaConfigFromEnv(): MpesaRouteConfig | null {
  const e = process.env;
  const config = {
    baseUrl: e.MPESA_BASE_URL ?? "",
    consumerKey: e.MPESA_CONSUMER_KEY ?? "",
    consumerSecret: e.MPESA_CONSUMER_SECRET ?? "",
    shortcode: e.MPESA_SHORTCODE ?? "",
    passkey: e.MPESA_PASSKEY ?? "",
    callbackUrl: e.MPESA_CALLBACK_URL ?? "",
  };
  if (Object.values(config).some((v) => v.trim() === "")) return null;
  return { config, transport: (url, init) => fetch(url, init) };
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
      enqueueStatement: deps.enqueueStatement,
      now,
    });
    registerAdminRoutes(app, { db, sessions: deps.sessions });

    // Resolve provider wiring once (explicit deps in tests, env in production) so
    // both the parent-facing payment routes and the reception top-up rails (S03)
    // share the same Daraja/Paystack config + transport.
    const mpesa = deps.mpesa ?? mpesaConfigFromEnv();
    const paystack = deps.paystack ?? paystackConfigFromEnv();

    // P1-E05-S01/S02/S03: Reception operator surface — parent search + profile
    // (read-only, always on) and the unified top-up (S03), which credits cash
    // synchronously and pushes the M-Pesa/Paystack rails when their wiring is
    // present (a method whose rail is unwired returns 503).
    registerReceptionRoutes(app, {
      db,
      sessions: deps.sessions,
      mpesa: mpesa ?? undefined,
      paystack: paystack ?? undefined,
    });

    // P1-E04-S06: Reception/Cashier counter cash top-up. Needs only db +
    // sessions (cash is a manual entry — no provider wiring), so always on.
    registerCashRoutes(app, { db, sessions: deps.sessions });

    // P1-E04-S07: admin-confirmed bank transfer top-up. Manual entry — no
    // provider wiring, so always on (guarded to admin/treasury internally).
    registerBankRoutes(app, { db, sessions: deps.sessions });

    // P1-E04-S01: M-Pesa STK push routes register only when Daraja wiring is
    // present (explicit dep in tests, or full env config in production).
    if (mpesa) {
      registerMpesaRoutes(app, {
        db,
        sessions: deps.sessions,
        mpesa,
        callback: deps.mpesaCallback,
      });
    }

    // P1-E04-S04: Paystack card top-up routes register only when Paystack wiring
    // is present (explicit dep in tests, or full env config in production).
    if (paystack) {
      registerPaystackRoutes(app, { db, sessions: deps.sessions, paystack });
    }
  }

  return app;
}
