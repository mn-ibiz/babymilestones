"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchStkStatus,
  initiateStkPush,
  isTerminalState,
  validateAmount,
  STK_PROGRESS_SECONDS,
  type MpesaStkState,
} from "../../lib/mpesa-api";

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

/**
 * M-Pesa top-up form for the parent dashboard (P1-E04-S01).
 *
 * AC1: amount entry (min 50 / max 70,000 KES) + confirm. On submit it initiates
 * an STK push; AC3 then shows "Check your phone…" with a 90-second countdown,
 * and AC4 polls the status endpoint, reflecting state transitions live until a
 * terminal state (or the window elapses).
 */
export function TopUpForm() {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [state, setState] = useState<MpesaStkState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(STK_PROGRESS_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  useEffect(() => stopTimers, []);

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
      const out = await initiateStkPush(kes, readCsrfToken());
      setCheckoutId(out.checkoutRequestId);
      setState(out.state);
      setSecondsLeft(STK_PROGRESS_SECONDS);
      // AC3: 90-second countdown.
      tickRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stopTimers();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
      // AC4: poll the status endpoint and reflect transitions live.
      pollRef.current = setInterval(async () => {
        try {
          const next = await fetchStkStatus(out.checkoutRequestId);
          setState(next);
          if (isTerminalState(next)) stopTimers();
        } catch {
          /* transient — keep polling until the window elapses */
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkoutId) {
    return (
      <div aria-label="M-Pesa top-up status">
        <p role="status">Check your phone… approve the M-Pesa prompt.</p>
        <p>{secondsLeft > 0 ? `Waiting ${secondsLeft}s` : "Still waiting — check your phone."}</p>
        <p>Status: {state}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-label="M-Pesa top-up">
      <label>
        Amount (KES)
        <input
          type="number"
          inputMode="numeric"
          min={50}
          max={70_000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Starting…" : "Pay with M-Pesa"}
      </button>
    </form>
  );
}
