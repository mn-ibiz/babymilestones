import type { FastifyInstance } from "fastify";
import { registerBankTransferRoutes } from "./topup.js";
import type { PaymentsDeps } from "../mpesa/index.js";

/**
 * Bank transfer payment routes (P1-E04-S07): admin records a pending transfer and
 * confirms it to credit a parent's wallet. Needs only db + sessions (manual
 * entry — no provider wiring), so it registers unconditionally.
 */
export function registerBankRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  registerBankTransferRoutes(app, deps);
}
