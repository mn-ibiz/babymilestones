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
import { registerAdminLoyalty } from "./loyalty.js";
import { registerAdminBackupRetention } from "./backup-retention.js";
import { registerAdminSalonReport } from "./salon-report.js";
import { registerAdminOperationsDashboard } from "./operations-dashboard.js";
import { registerAdminRevenueByPeriod } from "./revenue-by-period.js";
import { registerAdminStaffLeaderboard } from "./staff-leaderboard.js";
import { registerAdminWalletAging } from "./wallet-aging.js";
import { registerAdminFloatVsRevenue } from "./float-vs-revenue.js";
import { registerAdminPeakHoursHeatmap } from "./peak-hours-heatmap.js";
import { registerAdminCohortRetention } from "./cohort-retention.js";
import { registerAdminRepeatAttendance } from "./repeat-attendance.js";
import { registerAdminFeedbackDashboard } from "./feedback-dashboard.js";
import { registerAdminReviewSnippets } from "./review-snippets.js";
import { registerAdminAlerts } from "./alerts.js";
import { registerAdminDailyDispatch } from "./daily-dispatch.js";
import { registerAdminExpenses } from "./expenses.js";
import { registerAdminPnlReport } from "./pnl-report.js";
import { registerAdminTaxReport } from "./tax-report.js";
import {
  registerAdminWooCommerceConfig,
  type WooCommerceRouteConfig,
} from "./woocommerce-config.js";
import { registerAdminWooCommerceSync } from "./woocommerce-sync.js";
import { registerAdminWooCommerceStock } from "./woocommerce-stock.js";

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
  /**
   * Clock injection for deterministic reporting (e.g. the salon-report no-show
   * derivation, P3-E03-S05). Defaults to the wall clock.
   */
  now?: () => Date;
  /**
   * WooCommerce credentials-config wiring (Story 29.6): the at-rest encryption
   * key + the test-connection HTTP transport. When omitted, the WooCommerce
   * config routes are not registered (no real network is ever attempted from
   * config defaults).
   */
  woocommerce?: WooCommerceRouteConfig;
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
  registerAdminLoyalty(app, deps);
  registerAdminBackupRetention(app, deps);
  registerAdminSalonReport(app, deps); // P3-E03-S05 (Story 25.5)
  registerAdminOperationsDashboard(app, deps); // P3-E05-S01 (Story 27.1)
  registerAdminRevenueByPeriod(app, deps); // P3-E05-S02 (Story 27.2)
  registerAdminStaffLeaderboard(app, deps); // P3-E05-S03 (Story 27.3)
  registerAdminWalletAging(app, deps); // P3-E05-S04 (Story 27.4)
  registerAdminFloatVsRevenue(app, deps); // P5-E05-S04 (Story 35.4)
  registerAdminPeakHoursHeatmap(app, deps); // P3-E05-S05 (Story 27.5)
  registerAdminCohortRetention(app, deps); // Story 35.2
  registerAdminRepeatAttendance(app, deps); // Story 35.3
  registerAdminFeedbackDashboard(app, deps); // P6-E04-S02 (Story 34.2)
  registerAdminReviewSnippets(app, { db: deps.db, sessions: deps.sessions }); // P6-E04-S04 (Story 34.4)
  registerAdminAlerts(app, deps); // P6-E04-S03 (Story 34.3)
  registerAdminDailyDispatch(app, deps); // P4-E04-S04 (Story 29.4)
  registerAdminExpenses(app, { db: deps.db, sessions: deps.sessions }); // P6-E05-S05 (Story 35.5)
  registerAdminPnlReport(app, deps); // P6-E05-S01 (Story 35.1)
  registerAdminTaxReport(app, deps); // P6-E07-S06 (Story 35.6)
  registerAdminWooCommerceConfig(app, {
    db: deps.db,
    sessions: deps.sessions,
    woocommerce: deps.woocommerce,
  }); // P4-E04-S06 (Story 29.6)
  registerAdminWooCommerceSync(app, {
    db: deps.db,
    sessions: deps.sessions,
    jobs: deps.jobs,
    now: deps.now,
  }); // P4-E04-S07 (Story 29.7)
  registerAdminWooCommerceStock(app, {
    db: deps.db,
    sessions: deps.sessions,
  }); // P4-E04-S05 (Story 29.5)
}
