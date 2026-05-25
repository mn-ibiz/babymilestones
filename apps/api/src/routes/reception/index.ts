import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { SmsSender } from "@bm/sms";
import { registerParentSearch } from "./parents-search.js";
import { registerParentProfile } from "./parent-profile.js";
import { registerReceptionTopup } from "./topup.js";
import type { MpesaRouteConfig } from "../payments/mpesa/initiate.js";
import type { PaystackRouteConfig } from "../payments/paystack/init.js";

/** Shared deps for the Reception operator-surface routes (P1-E05). */
export interface ReceptionDeps {
  db: Database;
  sessions: SessionStore;
  /** SMS sender for parent notifications (P1-E05-S03). Defaults to the DB stub. */
  sms?: SmsSender;
  /** Daraja config + injected transport for the M-Pesa STK rail (P1-E05-S03). */
  mpesa?: MpesaRouteConfig;
  /** Paystack secret-key config + injected transport for the card rail (P1-E05-S03). */
  paystack?: PaystackRouteConfig;
}

export function registerReceptionRoutes(app: FastifyInstance, deps: ReceptionDeps): void {
  registerParentSearch(app, deps);
  registerParentProfile(app, deps);
  registerReceptionTopup(app, deps);
}
