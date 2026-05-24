import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { LoginRateLimiter, SessionStore } from "@bm/auth";
import { registerSignup } from "./signup.js";
import { registerLogin } from "./login.js";
import { registerStaffLogin } from "./staff-login.js";

export interface AuthDeps {
  db: Database;
  sessions: SessionStore;
  rateLimiter: LoginRateLimiter;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  registerSignup(app, deps);
  registerLogin(app, deps);
  registerStaffLogin(app, deps);
}
