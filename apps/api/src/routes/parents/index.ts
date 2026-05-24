import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerParentProfile } from "./profile.js";
import { registerParentChildren } from "./children.js";
import { registerReceptionWalkIn } from "./walkin.js";

export interface ParentsDeps {
  db: Database;
  sessions: SessionStore;
}

export function registerParentRoutes(app: FastifyInstance, deps: ParentsDeps): void {
  registerParentProfile(app, deps);
  registerParentChildren(app, deps);
  registerReceptionWalkIn(app, deps);
}
