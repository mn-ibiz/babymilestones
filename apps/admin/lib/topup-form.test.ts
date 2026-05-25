import { describe, expect, it } from "vitest";
import type { ReceptionTopupResponse } from "@bm/contracts";
import {
  TOPUP_METHOD_OPTIONS,
  TOPUP_MIN_KES,
  TOPUP_MAX_KES,
  canSubmitTopup,
  isLivePolling,
  kesToCents,
  stkStatusUrl,
  topupStatusLabel,
  validateTopup,
} from "./topup-form.js";

/**
 * P1-E05-S03 — Reception top-up sheet logic. Framework-agnostic unit tests for
 * the amount/method validation (AC1), the cents conversion, and the live-status
 * copy + polling rule (AC2/AC3).
 */
describe("topup-form (P1-E05-S03)", () => {
  it("offers all four methods in picker order (AC1)", () => {
    expect(TOPUP_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      "cash",
      "mpesa_stk",
      "paystack_card",
      "bank_transfer",
    ]);
  });

  it("converts whole KES to integer cents", () => {
    expect(kesToCents(100)).toBe(10_000);
    expect(kesToCents(1)).toBe(100);
  });

  it("validates a chosen method + an in-bounds whole amount (AC1)", () => {
    expect(validateTopup({ method: "cash", amountKes: 500 }).ok).toBe(true);
    expect(validateTopup({ method: "", amountKes: 500 }).errors.method).toBeDefined();
    expect(validateTopup({ method: "cash", amountKes: 12.5 }).errors.amountKes).toBeDefined();
    expect(
      validateTopup({ method: "cash", amountKes: TOPUP_MIN_KES - 1 }).errors.amountKes,
    ).toBeDefined();
    expect(
      validateTopup({ method: "cash", amountKes: TOPUP_MAX_KES + 1 }).errors.amountKes,
    ).toBeDefined();
  });

  it("canSubmit gates on validity", () => {
    expect(canSubmitTopup(validateTopup({ method: "mpesa_stk", amountKes: 500 }))).toBe(true);
    expect(canSubmitTopup(validateTopup({ method: "", amountKes: 0 }))).toBe(false);
  });

  it("labels cash settled as receipt printed (AC3)", () => {
    expect(topupStatusLabel("cash", "settled")).toMatch(/receipt printed/i);
  });

  it("labels mpesa pending as awaiting the phone (AC2)", () => {
    expect(topupStatusLabel("mpesa_stk", "pending")).toMatch(/STK sent/i);
    expect(topupStatusLabel("paystack_card", "pending")).toMatch(/card/i);
    expect(topupStatusLabel("cash", "failed")).toMatch(/failed/i);
  });

  it("polls live only for a pending M-Pesa STK top-up (AC2)", () => {
    const mpesaPending: ReceptionTopupResponse = {
      method: "mpesa_stk",
      status: "pending",
      transactionId: "ws_CO_1",
    };
    const cashSettled: ReceptionTopupResponse = {
      method: "cash",
      status: "settled",
      transactionId: null,
    };
    expect(isLivePolling(mpesaPending)).toBe(true);
    expect(isLivePolling(cashSettled)).toBe(false);
    expect(stkStatusUrl("ws_CO_1")).toBe("/api/reception/topup/mpesa_stk/ws_CO_1");
  });
});
