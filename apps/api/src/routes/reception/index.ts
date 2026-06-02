import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import type { SmsSender } from "@bm/sms";
import { registerParentSearch } from "./parents-search.js";
import { registerParentProfile } from "./parent-profile.js";
import { registerReceptionTopup } from "./topup.js";
import { registerRecordVisit } from "./record-visit.js";
import { registerReceptionBooking } from "./booking.js";
import { registerRecentTransactions } from "./recent-transactions.js";
import { registerReceipt } from "./receipt.js";
import { registerAttendance } from "./attendance.js";
import { registerHandoff } from "./handoff.js";
import { registerReceptionSalon } from "./salon.js";
import type { SalonFeedbackHook } from "@bm/catalog";
import type { MpesaRouteConfig } from "../payments/mpesa/initiate.js";
import type { PaystackRouteConfig } from "../payments/paystack/init.js";

/** Shared deps for the Reception operator-surface routes (P1-E05). */
export interface ReceptionDeps {
  db: Database;
  sessions: SessionStore;
  /** SMS sender for parent notifications (P1-E05-S03). Defaults to the DB stub. */
  sms?: SmsSender;
  /** Daraja config + injected transport for the M-Pesa STK rail (P1-E05-S03). */
  mpesa?: MpesaRouteConfig;
  /** Paystack secret-key config + injected transport for the card rail (P1-E05-S03). */
  paystack?: PaystackRouteConfig;
  /** Clock injection for the attendant screen's default "today" (P2-E03-S02). */
  now?: () => Date;
  /**
   * Forward-compatible salon feedback-prompt hook (P3-E03-S03 AC3 → P5-E04 / Epic
   * 34, NOT yet built). Defaults to a no-op when omitted.
   */
  salonFeedbackHook?: SalonFeedbackHook;
}

export function registerReceptionRoutes(app: FastifyInstance, deps: ReceptionDeps): void {
  registerParentSearch(app, deps);
  registerParentProfile(app, deps);
  registerReceptionTopup(app, deps);
  registerRecordVisit(app, deps);
  registerReceptionBooking(app, deps);
  registerRecentTransactions(app, deps);
  registerReceipt(app, deps);
  registerAttendance(app, deps);
  registerHandoff(app, deps);
  registerReceptionSalon(app, deps);
}
