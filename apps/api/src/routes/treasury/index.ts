import type { FastifyInstance } from "fastify";
import { registerFloatAccountRoutes, type FloatAccountsDeps } from "./float-accounts.js";

/**
 * Treasury & float-segregation API surface (P1-E06). Float-account CRUD is
 * guarded to admin/treasury internally; it needs only db + sessions, so it
 * registers unconditionally.
 */
export function registerTreasuryRoutes(app: FastifyInstance, deps: FloatAccountsDeps): void {
  registerFloatAccountRoutes(app, deps);
}
