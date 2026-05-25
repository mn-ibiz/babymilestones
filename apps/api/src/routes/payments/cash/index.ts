import type { FastifyInstance } from "fastify";
import { registerCashTopup } from "./topup.js";
import type { PaymentsDeps } from "../mpesa/index.js";

/**
 * Cash payment routes (P1-E04-S06): the Reception/Cashier counter cash top-up.
 * Needs only db + sessions, so it registers unconditionally (no provider wiring).
 */
export function registerCashRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  registerCashTopup(app, deps);
}
