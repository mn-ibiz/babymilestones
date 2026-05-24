import { audit, type Database } from "@bm/db";
import { generateStatementCsv } from "@bm/wallet";
import type { Job } from "../registry.js";

/** One queued long-range statement request (> 12 months, P1-E03-S08 AC3). */
export interface StatementRequest {
  walletId: string;
  /** ISO timestamp, inclusive window start. */
  from: string;
  /** ISO timestamp, inclusive window end. */
  to: string;
  /** Actor (parent or staff) that requested the export. */
  requestedBy: string;
}

export interface WalletStatementJobDeps {
  db: Database;
  /** Pull the next batch of queued long-range requests. */
  dequeue: () => StatementRequest[];
  /** Sink the rendered CSV (e.g. into the signed-URL store / email). */
  deliver: (req: StatementRequest, csv: string) => Promise<void> | void;
}

/**
 * Async wallet-statement worker (P1-E03-S08 AC3). Long ranges (> 12 months)
 * are too slow to render in the request path, so the API enqueues them and this
 * worker renders the CSV out-of-band, delivers it, and audits completion. The
 * generation logic is the same {@link generateStatementCsv} used synchronously,
 * so sync and async statements are byte-identical for the same window.
 */
export function createWalletStatementJob(deps: WalletStatementJobDeps): Job {
  return {
    name: "wallet-statement",
    run: async () => {
      for (const req of deps.dequeue()) {
        const csv = await generateStatementCsv(deps.db, {
          walletId: req.walletId,
          range: { from: new Date(req.from), to: new Date(req.to) },
        });
        await deps.deliver(req, csv);
        await audit(deps.db, {
          actor: req.requestedBy,
          action: "wallet.statement.export.completed",
          target: { table: "wallets", id: req.walletId },
          payload: { from: req.from, to: req.to, mode: "async", bytes: csv.length },
        });
      }
    },
  };
}
