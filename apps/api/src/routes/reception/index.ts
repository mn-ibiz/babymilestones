import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerParentSearch } from "./parents-search.js";

/** Shared deps for the Reception operator-surface routes (P1-E05). */
export interface ReceptionDeps {
  db: Database;
  sessions: SessionStore;
}

export function registerReceptionRoutes(app: FastifyInstance, deps: ReceptionDeps): void {
  registerParentSearch(app, deps);
}
