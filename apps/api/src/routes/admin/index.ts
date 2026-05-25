import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { SmsSender } from "@bm/sms";
import { registerAdminRefund } from "./refund.js";
import { registerAdminAutoCredit } from "./auto-credit.js";
import { registerAdminServices } from "./services.js";
import { registerAdminStaff } from "./staff.js";
import { registerAdminUsers } from "./users.js";
import { registerAdminSmsConfig } from "./sms-config.js";
import { registerAdminSmsTemplates } from "./sms-templates.js";

export interface AdminDeps {
  db: Database;
  sessions: SessionStore;
  /** SMS sender for parent notifications. Defaults to the DB-backed stub. */
  sms?: SmsSender;
}

/** Admin-only API surface (P1-E03-S06+). All routes guard with the rbac matrix. */
export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): void {
  registerAdminRefund(app, deps);
  registerAdminAutoCredit(app, deps);
  registerAdminServices(app, deps);
  registerAdminStaff(app, deps);
  registerAdminUsers(app, deps);
  registerAdminSmsConfig(app, deps);
  registerAdminSmsTemplates(app, deps);
}
