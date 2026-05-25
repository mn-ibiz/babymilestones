import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import type { SessionStore } from "@bm/auth";
import { registerReceiptRender } from "./render.js";
import { registerReceiptReprint } from "./reprint.js";
import { registerReceiptVoid } from "./void.js";

/** Shared deps for the receipt-engine routes (P1-E08). */
export interface ReceiptsDeps {
  db: Database;
  sessions: SessionStore;
}

export function registerReceiptRoutes(app: FastifyInstance, deps: ReceiptsDeps): void {
  registerReceiptRender(app, deps);
  registerReceiptReprint(app, deps);
  registerReceiptVoid(app, deps);
}
