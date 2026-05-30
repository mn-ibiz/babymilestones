import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { ExportStorage } from "@bm/export";
import { registerParentProfile } from "./profile.js";
import { registerParentChildren } from "./children.js";
import { registerParentPickups } from "./pickups.js";
import { registerParentObservations } from "./observations.js";
import { registerReceptionWalkIn } from "./walkin.js";
import { registerReceptionCheckIn } from "./checkin.js";
import { registerParentExports } from "./exports.js";
import { registerParentStatement } from "./statement.js";
import { registerParentWallet } from "./wallet.js";
import { registerParentAvailability } from "./availability.js";
import { registerParentBooking } from "./booking.js";
import { registerParentSubscriptions } from "./subscriptions.js";
import { registerParentLoyalty } from "./loyalty.js";

export interface ParentsDeps {
  db: Database;
  sessions: SessionStore;
}

export interface ParentRoutesDeps extends ParentsDeps {
  /** Shared signed-URL S3-equivalent store for export ZIPs (P1-E02-S05). */
  exportStorage: ExportStorage;
  /** Enqueue an export job for async processing (P1-E02-S05). */
  enqueueExport: (exportId: string) => void;
  /** Enqueue an async wallet-statement generation for long ranges (P1-E03-S08). */
  enqueueStatement?: (input: {
    walletId: string;
    from: string;
    to: string;
    requestedBy: string;
  }) => void;
  now?: () => number;
}

export function registerParentRoutes(app: FastifyInstance, deps: ParentRoutesDeps): void {
  registerParentProfile(app, deps);
  registerParentChildren(app, deps);
  registerParentPickups(app, deps);
  registerParentObservations(app, deps);
  registerReceptionWalkIn(app, deps);
  registerReceptionCheckIn(app, deps);
  registerParentExports(app, {
    db: deps.db,
    sessions: deps.sessions,
    exportStorage: deps.exportStorage,
    enqueueExport: deps.enqueueExport,
    now: deps.now,
  });
  registerParentStatement(app, {
    db: deps.db,
    sessions: deps.sessions,
    enqueueStatement: deps.enqueueStatement,
  });
  registerParentWallet(app, { db: deps.db, sessions: deps.sessions });
  registerParentAvailability(app, {
    db: deps.db,
    sessions: deps.sessions,
    now: deps.now ? () => new Date(deps.now!()) : undefined,
  });
  registerParentBooking(app, {
    db: deps.db,
    sessions: deps.sessions,
    now: deps.now ? () => new Date(deps.now!()) : undefined,
  });
  registerParentSubscriptions(app, {
    db: deps.db,
    sessions: deps.sessions,
    now: deps.now ? () => new Date(deps.now!()) : undefined,
  });
  registerParentLoyalty(app, { db: deps.db, sessions: deps.sessions });
}
