import type { FastifyInstance } from "fastify";
import { registerFloatAccountRoutes, type FloatAccountsDeps } from "./float-accounts.js";
import { registerReconciliationRoutes } from "./reconciliation.js";

export interface TreasuryDeps extends FloatAccountsDeps {
  /** Clock injection for the reconciliation `asOf` day (deterministic tests). */
  now?: () => number;
}

/**
 * Treasury & float-segregation API surface (P1-E06). Float-account CRUD
 * (P1-E06-S01) and the daily reconciliation read model + adjusting-entry
 * dual-approval flow (P1-E06-S02). Both are guarded to admin/treasury internally;
 * they need only db + sessions, so they register unconditionally.
 */
export function registerTreasuryRoutes(app: FastifyInstance, deps: TreasuryDeps): void {
  registerFloatAccountRoutes(app, deps);
  registerReconciliationRoutes(app, deps);
}
