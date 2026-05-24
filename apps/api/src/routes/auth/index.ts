import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerSignup } from "./signup.js";

export interface AuthDeps {
  db: Database;
  sessions: SessionStore;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  registerSignup(app, deps);
}
