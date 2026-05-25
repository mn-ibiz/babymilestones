"use client";

import { useState } from "react";
import { initPaystack, validateAmount } from "../../lib/paystack-api";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/**
 * Paystack card top-up form for the parent dashboard (P1-E04-S04).
 *
 * AC1: amount entry + optional "save card" (card-on-file, AC4) + a "Pay with
 * card" CTA. On submit it initializes a hosted-checkout transaction and redirects
 * the browser to Paystack's authorization URL. On a successful charge Paystack
 * redirects back to the return page, which shows "verifying…" (AC2/AC3).
 */
export function PaystackTopUpForm() {
  const [amount, setAmount] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const kes = Number(amount);
    const invalid = validateAmount(kes);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    try {
      const out = await initPaystack(kes, saveCard, readCsrfToken());
      // AC1: open Paystack hosted checkout.
      window.location.assign(out.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Paystack card top-up">
      <label>
        Amount (KES)
        <input
          type="number"
          inputMode="numeric"
          min={50}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={saveCard}
          onChange={(e) => setSaveCard(e.target.checked)}
        />
        Save this card for faster top-ups
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Starting…" : "Pay with card"}
      </button>
    </form>
  );
}
