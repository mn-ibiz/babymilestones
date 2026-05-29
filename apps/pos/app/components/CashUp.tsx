"use client";

import { useEffect, useState } from "react";
import type { PosCashupExpected, PosCashupResponse } from "@bm/contracts";
import { formatKes } from "../../lib/products";
import { computeVariance, isReasonRequired, varianceLabel } from "../../lib/cashup";
import { fetchExpected, submitCashup } from "../../lib/cashup-api";

/**
 * End-of-day cash-up (P2-E04-S05). On open it shows the expected takings by
 * method since the last close (AC1). The cashier counts the drawer and enters
 * the cash; the variance updates live (AC2) and a reason field is required once
 * it exceeds KES 500 (AC3). Submitting records the cash-up and posts a pending
 * reconciliation adjustment for any variance (AC4).
 */
export function CashUp() {
  const [expected, setExpected] = useState<PosCashupExpected | null>(null);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PosCashupResponse | null>(null);

  useEffect(() => {
    void fetchExpected().then(setExpected);
  }, []);

  const countedNum = Number(counted);
  const countedCents = Number.isFinite(countedNum) ? Math.round(countedNum * 100) : NaN;
  const variance =
    expected && Number.isFinite(countedCents) ? computeVariance(countedCents, expected.expectedCashCents) : 0;
  const reasonNeeded = isReasonRequired(variance);

  async function submit() {
    setError(null);
    // `Number("")` is a finite 0, so guard the empty field explicitly — a blank
    // count must not post as a zero-cash drawer.
    if (counted.trim() === "" || !Number.isFinite(countedCents)) {
      setError("Enter the counted cash amount.");
      return;
    }
    if (reasonNeeded && reason.trim() === "") {
      setError("A reason is required for a variance over KES 500.");
      return;
    }
    setBusy(true);
    try {
      const res = await submitCashup(countedCents, reason.trim() || undefined);
      if (res.ok) setDone(res.cashup);
      else setError(res.error);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Till closed</h1>
        <p className="mt-2 text-sm">
          Variance: {varianceLabel(done.varianceCents)}.
          {done.reconciliationAdjustmentId
            ? " A reconciliation entry was sent to Treasury for review."
            : ""}
        </p>
        <a href="/" className="touch-target mt-4 inline-flex items-center rounded-lg bg-brand px-5 font-medium text-surface">
          Back to till
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">End of day</h1>

      <dl className="flex flex-col gap-1 rounded-xl border border-ink/10 p-4 text-sm">
        <div className="flex justify-between">
          <dt>Expected cash</dt>
          <dd className="tabular-nums">{expected ? formatKes(expected.expectedCashCents) : "…"}</dd>
        </div>
        <div className="flex justify-between text-ink/70">
          <dt>Expected M-Pesa</dt>
          <dd className="tabular-nums">{expected ? formatKes(expected.expectedMpesaCents) : "…"}</dd>
        </div>
        <div className="flex justify-between text-ink/70">
          <dt>Expected Paystack</dt>
          <dd className="tabular-nums">{expected ? formatKes(expected.expectedPaystackCents) : "…"}</dd>
        </div>
      </dl>

      <label className="flex flex-col gap-1 text-sm">
        Cash counted (KES)
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          className="touch-target rounded-lg border border-ink/20 px-3"
        />
      </label>

      {counted !== "" && Number.isFinite(countedCents) && (
        <p className={`text-sm ${variance === 0 ? "text-success" : "text-warn"}`}>{varianceLabel(variance)}</p>
      )}

      {reasonNeeded && (
        <label className="flex flex-col gap-1 text-sm">
          Reason for the variance (required)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="touch-target rounded-lg border border-ink/20 px-3"
          />
        </label>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="touch-target rounded-lg bg-brand px-4 font-medium text-surface disabled:opacity-50"
      >
        {busy ? "Closing…" : "Close till"}
      </button>
    </main>
  );
}
