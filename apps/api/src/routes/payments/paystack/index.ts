import type { FastifyInstance } from "fastify";
import { registerPaystackInit, type PaystackRouteConfig } from "./init.js";
import { registerPaystackWebhook } from "./webhook.js";
import type { PaymentsDeps } from "../mpesa/index.js";

export type { PaystackRouteConfig };

/**
 * Register the Paystack card top-up routes (P1-E04-S04): the parent-facing init
 * (initialize a hosted-checkout transaction), the redirect-back verify endpoint,
 * and the signature-verified webhook (S05) — the authoritative source of truth
 * for crediting the wallet.
 */
export function registerPaystackRoutes(app: FastifyInstance, deps: PaymentsDeps): void {
  if (!deps.paystack) return;
  registerPaystackInit(app, deps);
  registerPaystackWebhook(app, deps);
}
