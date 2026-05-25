"use client";

import { useEffect, useState } from "react";
import { verifyPaystack, type PaystackTxState } from "../../lib/paystack-api";

/**
 * Paystack redirect-back handler (P1-E04-S04 AC2/AC3). Paystack redirects the
 * payer back here with a `reference` query param. While verifying it shows
 * "verifying…"; it then reflects the outcome. The webhook (S05) remains the
 * source of truth for actually crediting the wallet — this verify is UX only.
 */
export function PaystackReturn({ reference }: { reference: string | null }) {
  const [state, setState] = useState<PaystackTxState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setError("Missing payment reference.");
      return;
    }
    let active = true;
    verifyPaystack(reference)
      .then((s) => {
        if (active) setState(s);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Verification failed");
      });
    return () => {
      active = false;
    };
  }, [reference]);

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (state === null) {
    return <p role="status">Verifying your payment…</p>;
  }
  if (state === "SUCCEEDED") {
    return <p role="status">Payment confirmed — your wallet will be credited shortly.</p>;
  }
  if (state === "FAILED" || state === "ABANDONED") {
    return <p role="status">That payment didn&apos;t go through. You can try again.</p>;
  }
  return <p role="status">Still verifying… this can take a moment.</p>;
}
