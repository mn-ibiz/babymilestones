import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerMpesaStkInitiate, type MpesaRouteConfig } from "./initiate.js";
import { registerMpesaCallback, type MpesaCallbackConfig } from "./callback.js";
import type { PaystackRouteConfig } from "../paystack/init.js";

/** Deps for the payment routes (P1-E04). */
export interface PaymentsDeps {
  db: Database;
  sessions: SessionStore;
  /** Daraja config + injected/mockable transport (no real network in tests). */
  mpesa?: MpesaRouteConfig;
  /** C2B/STK callback handler config (Daraja IP allowlist) — P1-E04-S02. */
  callback?: MpesaCallbackConfig;
  /** Paystack secret-key config + injected/mockable transport — P1-E04-S04. */
  paystack?: PaystackRouteConfig;
}

/**
 * Register the M-Pesa routes (P1-E04): the parent-facing STK push initiation
 * (S01) and the unauthenticated Daraja C2B/STK callback handler (S02).
 */
export function registerMpesaRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  if (!deps.mpesa) return;
  registerMpesaStkInitiate(app, deps);
  registerMpesaCallback(app, deps, deps.callback);
}
