import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { SmsSender } from "@bm/sms";
import { registerAdminRefund } from "./refund.js";
import { registerAdminAutoCredit } from "./auto-credit.js";
import { registerAdminServices } from "./services.js";
import { registerAdminSchedules } from "./schedules.js";
import { registerAdminPlans } from "./plans.js";
import { registerAdminStaff } from "./staff.js";
import { registerAdminUsers } from "./users.js";
import { registerAdminSmsConfig } from "./sms-config.js";
import { registerAdminSmsLive } from "./sms-live.js";
import { registerAdminSmsTemplates } from "./sms-templates.js";
import { registerAdminAudit } from "./audit.js";
import { registerAdminSettings } from "./settings.js";
import { registerAdminLoyaltyRates } from "./loyalty-rates.js";
import { registerAdminJobs, type RunnableJob } from "./jobs.js";
import { registerCommissionRateRoutes } from "./commission-rates.js";
import { registerCommissionRuns } from "./commission-runs.js";
import { registerAdminEtims } from "./etims.js";
import { registerAdminEvents } from "./events.js";
import { registerDoorCheckIn } from "./door.js";

export interface AdminDeps {
  db: Database;
  sessions: SessionStore;
  /** SMS sender for parent notifications. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /**
   * Background jobs the super-admin console can trigger manually (P3-E06-S01
   * AC4). Wired from `apps/jobs` at boot; omitted in surfaces that don't run a
   * worker (the run-now endpoint then exposes an empty registry).
   */
  jobs?: RunnableJob[];
}

/** Admin-only API surface (P1-E03-S06+). All routes guard with the rbac matrix. */
export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): void {
  registerAdminRefund(app, deps);
  registerAdminAutoCredit(app, deps);
  registerAdminServices(app, deps);
  registerAdminSchedules(app, deps);
  registerAdminPlans(app, deps);
  registerAdminStaff(app, deps);
  registerAdminUsers(app, deps);
  registerAdminSmsConfig(app, deps);
  registerAdminSmsLive(app, deps);
  registerAdminSmsTemplates(app, deps);
  registerAdminAudit(app, deps);
  registerAdminSettings(app, deps);
  registerAdminLoyaltyRates(app, deps);
  registerAdminJobs(app, { db: deps.db, sessions: deps.sessions, jobs: deps.jobs });
  registerCommissionRateRoutes(app, deps); // P3-E01-S01
  registerCommissionRuns(app, deps); // P3-E01-S04/S05
  registerAdminEtims(app, deps);
  registerAdminEvents(app, deps);
  registerDoorCheckIn(app, deps);
}
