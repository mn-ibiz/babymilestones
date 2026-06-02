import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { SmsSender } from "@bm/sms";
import { registerPosProducts } from "./products.js";
import { registerPosSales } from "./sales.js";
import { registerPosCashup } from "./cashup.js";
import { registerPosOnlineOrders } from "./online-orders.js";
import { registerPosOrderTransitions } from "./order-transitions.js";
import type { MpesaRouteConfig } from "../payments/mpesa/initiate.js";
import type { PaystackRouteConfig } from "../payments/paystack/init.js";

/** Shared deps for the in-store POS routes (P2-E04). */
export interface PosDeps {
  db: Database;
  sessions: SessionStore;
  /** SMS sender for the receipt copy (P2-E04-S04). Defaults to the DB stub. */
  sms?: SmsSender;
  /** Daraja config + injected transport for the M-Pesa STK rail (S04). */
  mpesa?: MpesaRouteConfig;
  /** Paystack secret-key config + injected transport for the card rail (S04). */
  paystack?: PaystackRouteConfig;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

export function registerPosRoutes(app: FastifyInstance, deps: PosDeps): void {
  registerPosProducts(app, deps);
  registerPosSales(app, deps);
  registerPosCashup(app, deps);
  registerPosOnlineOrders(app, deps);
  registerPosOrderTransitions(app, deps);
}
