import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerMpesaStkInitiate, type MpesaRouteConfig } from "./initiate.js";

/** Deps for the M-Pesa payment routes (P1-E04). */
export interface PaymentsDeps {
  db: Database;
  sessions: SessionStore;
  /** Daraja config + injected/mockable transport (no real network in tests). */
  mpesa: MpesaRouteConfig;
}

/** Register the parent-facing M-Pesa STK push routes (P1-E04-S01). */
export function registerMpesaRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  registerMpesaStkInitiate(app, deps);
}
