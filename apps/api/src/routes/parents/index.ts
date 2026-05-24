import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { ExportStorage } from "@bm/export";
import { registerParentProfile } from "./profile.js";
import { registerParentChildren } from "./children.js";
import { registerReceptionWalkIn } from "./walkin.js";
import { registerReceptionCheckIn } from "./checkin.js";
import { registerParentExports } from "./exports.js";

export interface ParentsDeps {
  db: Database;
  sessions: SessionStore;
}

export interface ParentRoutesDeps extends ParentsDeps {
  /** Shared signed-URL S3-equivalent store for export ZIPs (P1-E02-S05). */
  exportStorage: ExportStorage;
  /** Enqueue an export job for async processing (P1-E02-S05). */
  enqueueExport: (exportId: string) => void;
  now?: () => number;
}

export function registerParentRoutes(app: FastifyInstance, deps: ParentRoutesDeps): void {
  registerParentProfile(app, deps);
  registerParentChildren(app, deps);
  registerReceptionWalkIn(app, deps);
  registerReceptionCheckIn(app, deps);
  registerParentExports(app, {
    db: deps.db,
    sessions: deps.sessions,
    exportStorage: deps.exportStorage,
    enqueueExport: deps.enqueueExport,
    now: deps.now,
  });
}
