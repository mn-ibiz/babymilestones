import { describe, expect, it } from "vitest";
import {
  ErrorRateWindow,
  ledgerFailureAlert,
  webhookFailureAlert,
  type Alert,
} from "./alerts.js";

describe("ErrorRateWindow (error rate > 1% over 5 min)", () => {
  it("does not alert below the threshold", () => {
    const w = new ErrorRateWindow({ windowMs: 5 * 60_000, thresholdRatio: 0.01 });
    let now = 1_000;
    for (let i = 0; i < 200; i++) w.record(false, now++);
    w.record(true, now++); // 1 error / 201 ≈ 0.5%
    expect(w.alert(now)).toBeNull();
  });

  it("alerts when the error ratio exceeds 1% within the window", () => {
    const w = new ErrorRateWindow({ windowMs: 5 * 60_000, thresholdRatio: 0.01 });
    let now = 1_000;
    for (let i = 0; i < 90; i++) w.record(false, now++);
    for (let i = 0; i < 10; i++) w.record(true, now++); // 10% error rate
    const alert = w.alert(now);
    expect(alert).not.toBeNull();
    expect(alert!.kind).toBe("error_rate");
    expect(alert!.severity).toBe("critical");
  });

  it("drops events outside the rolling window so old errors clear", () => {
    const w = new ErrorRateWindow({ windowMs: 5 * 60_000, thresholdRatio: 0.01 });
    let t = 0;
    for (let i = 0; i < 10; i++) w.record(true, t++); // burst of errors at t≈0
    const later = 10 * 60_000; // 10 min later — window is empty
    for (let i = 0; i < 100; i++) w.record(false, later + i);
    expect(w.alert(later + 100)).toBeNull();
  });

  it("requires a minimum sample before alerting", () => {
    const w = new ErrorRateWindow({ windowMs: 5 * 60_000, thresholdRatio: 0.01, minSamples: 20 });
    w.record(true, 1);
    expect(w.alert(2)).toBeNull(); // single error, too few samples
  });
});

describe("webhookFailureAlert", () => {
  it("fires on any payments webhook failure", () => {
    const alert: Alert = webhookFailureAlert({ provider: "mpesa", reason: "signature mismatch" });
    expect(alert.kind).toBe("payments_webhook_failure");
    expect(alert.severity).toBe("critical");
    expect(alert.detail.provider).toBe("mpesa");
  });
});

describe("ledgerFailureAlert", () => {
  it("fires on any ledger insert failure", () => {
    const alert: Alert = ledgerFailureAlert({ operation: "post", reason: "constraint violation" });
    expect(alert.kind).toBe("ledger_insert_failure");
    expect(alert.severity).toBe("critical");
    expect(alert.detail.operation).toBe("post");
  });
});
