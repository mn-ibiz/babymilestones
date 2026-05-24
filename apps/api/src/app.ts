import Fastify, { type FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerAuthRoutes } from "./routes/auth/index.js";

export interface AppDeps {
  db?: Database;
  sessions?: SessionStore;
}

/** Build the single API surface that serves all front-end apps. */
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/healthz", async () => ({ status: "ok" }));

  if (deps.db && deps.sessions) {
    registerAuthRoutes(app, { db: deps.db, sessions: deps.sessions });
  }

  return app;
}
