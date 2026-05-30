import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import { registerPublicEvents } from "./events.js";

export interface PublicRoutesDeps {
  db: Database;
  now?: () => Date;
}

/** Public, unauthenticated API surface (P4-E05-S02 onward). */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDeps): void {
  registerPublicEvents(app, deps);
}
