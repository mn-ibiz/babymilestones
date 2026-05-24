import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type {
  ConsumedTokenStore,
  LoginRateLimiter,
  ResetRateLimiter,
  SessionStore,
} from "@bm/auth";
import { registerSignup } from "./signup.js";
import { registerLogin } from "./login.js";
import { registerStaffLogin } from "./staff-login.js";
import { registerLogout } from "./logout.js";
import { registerResetRequest } from "./reset-request.js";
import { registerResetVerify } from "./reset-verify.js";
import { registerResetComplete } from "./reset-complete.js";

export interface AuthDeps {
  db: Database;
  sessions: SessionStore;
  rateLimiter: LoginRateLimiter;
  /** Per-phone reset-code request limiter (P1-E01-S05 AC4). */
  resetRateLimiter: ResetRateLimiter;
  /** Single-use tracker for redeemed reset tokens (P1-E01-S05 AC2). */
  consumedTokens: ConsumedTokenStore;
  /** HMAC secret backing reset tokens. */
  resetTokenSecret: string;
  /** Clock injection point so tests can drive TTL/expiry deterministically. */
  now: () => number;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  registerSignup(app, deps);
  registerLogin(app, deps);
  registerStaffLogin(app, deps);
  registerLogout(app, deps);
  registerResetRequest(app, deps);
  registerResetVerify(app, deps);
  registerResetComplete(app, deps);
}
