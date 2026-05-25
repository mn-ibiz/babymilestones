import { describe, expect, it } from "vitest";
import {
  guardLedgerInsert,
  guardWebhook,
  type Alert,
  type AlertSink,
} from "./alert-hooks.js";

function recordingSink(): AlertSink & { alerts: Alert[] } {
  const alerts: Alert[] = [];
  return { alerts, emit: (a) => alerts.push(a) };
}

describe("guardLedgerInsert", () => {
  it("passes through the result on success and emits nothing", async () => {
    const sink = recordingSink();
    const row = await guardLedgerInsert(
      { operation: "post", sink },
      async () => ({ id: "row-1" }),
    );
    expect(row).toEqual({ id: "row-1" });
    expect(sink.alerts).toHaveLength(0);
  });

  it("emits a ledger_insert_failure alert and rethrows on failure", async () => {
    const sink = recordingSink();
    await expect(
      guardLedgerInsert({ operation: "post", walletId: "w1", sink }, async () => {
        throw new Error("constraint violation");
      }),
    ).rejects.toThrow("constraint violation");
    expect(sink.alerts).toHaveLength(1);
    expect(sink.alerts[0]!.kind).toBe("ledger_insert_failure");
    expect(sink.alerts[0]!.detail.walletId).toBe("w1");
  });
});

describe("guardWebhook", () => {
  it("emits a payments_webhook_failure alert and rethrows on failure", async () => {
    const sink = recordingSink();
    await expect(
      guardWebhook({ provider: "mpesa", sink }, async () => {
        throw new Error("signature mismatch");
      }),
    ).rejects.toThrow("signature mismatch");
    expect(sink.alerts).toHaveLength(1);
    expect(sink.alerts[0]!.kind).toBe("payments_webhook_failure");
    expect(sink.alerts[0]!.detail.provider).toBe("mpesa");
  });

  it("does not emit on success", async () => {
    const sink = recordingSink();
    const out = await guardWebhook({ provider: "paystack", sink }, async () => "ok");
    expect(out).toBe("ok");
    expect(sink.alerts).toHaveLength(0);
  });
});
