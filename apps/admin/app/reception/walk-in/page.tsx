"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PhoneCheckResult } from "@bm/contracts";
import {
  PHONE_CHECK_DEBOUNCE_MS,
  validateWalkIn,
  canSubmit,
  debounce,
  type PhoneCheckState,
  type WalkInFormValues,
} from "../../../lib/walkin-form";

/**
 * Reception one-screen walk-in registration form (P1-E02-S02).
 *
 * AC1: single screen — phone (required), first/last name, optional email + area.
 * AC2: live debounced (300ms) phone-collision check; on a duplicate, offer
 *      "Open existing" or set a "Merge intent" flag.
 * AC3: no PIN field — the account is created credential-less and the parent
 *      verifies via OTP on first self-login.
 * Server is authoritative: this posts to the API, which re-validates + enforces
 * the reception `create:user` permission.
 */
const EMPTY: WalkInFormValues = { phone: "", firstName: "", lastName: "", email: "", residentialArea: "" };

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

export default function WalkInPage() {
  const [values, setValues] = useState<WalkInFormValues>(EMPTY);
  const [phoneCheck, setPhoneCheck] = useState<PhoneCheckState>({ status: "idle" });
  const [mergeIntent, setMergeIntent] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validation = useMemo(() => validateWalkIn(values), [values]);

  // AC2: debounce the live collision check to one request per 300ms of quiet.
  const runCheck = useRef(
    debounce(async (phone: string) => {
      if (!phone.trim()) {
        setPhoneCheck({ status: "idle" });
        return;
      }
      setPhoneCheck({ status: "checking" });
      try {
        const res = await fetch(`/parents/phone-check?phone=${encodeURIComponent(phone)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          setPhoneCheck({ status: "error" });
          return;
        }
        const body = (await res.json()) as PhoneCheckResult;
        if (body.available || !body.existing) setPhoneCheck({ status: "available" });
        else setPhoneCheck({ status: "duplicate", existing: body.existing });
      } catch {
        setPhoneCheck({ status: "error" });
      }
    }, PHONE_CHECK_DEBOUNCE_MS),
  ).current;

  const onPhone = useCallback(
    (phone: string) => {
      setValues((v) => ({ ...v, phone }));
      runCheck(phone);
    },
    [runCheck],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit(validation, phoneCheck)) return;
      setSubmitError(null);
      const res = await fetch("/parents/walk-in", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        const body = (await res.json()) as { userId: string };
        setSubmitted(body.userId);
        setValues(EMPTY);
        setPhoneCheck({ status: "idle" });
        return;
      }
      // Server is authoritative: surface its error instead of a silent no-op.
      // A 409 means the phone already exists — fall back to the duplicate
      // affordance (AC2); other statuses show the error message.
      const err = (await res.json().catch(() => null)) as
        | { error?: string; existing?: PhoneCheckResult["existing"] }
        | null;
      if (res.status === 409 && err?.existing) {
        setPhoneCheck({ status: "duplicate", existing: err.existing });
      }
      setSubmitError(err?.error ?? "Could not register the parent. Please try again.");
    },
    [validation, phoneCheck, values],
  );

  const dup = phoneCheck.status === "duplicate" ? phoneCheck.existing : null;

  return (
    <main>
      <h1>Register walk-in parent</h1>
      {submitted && <p role="status">Parent created. They set a PIN via OTP on first login.</p>}
      {submitError && <p role="alert">{submitError}</p>}
      <form onSubmit={onSubmit}>
        <label>
          Phone (required)
          <input
            name="phone"
            value={values.phone}
            onChange={(e) => onPhone(e.target.value)}
            aria-invalid={Boolean(validation.errors.phone)}
            required
          />
        </label>
        {phoneCheck.status === "checking" && <span>Checking…</span>}
        {dup && (
          <div role="alert">
            <p>A parent with this phone already exists.</p>
            <button type="button" onClick={() => { window.location.href = `/reception/parents/${dup.userId}`; }}>
              Open existing
            </button>
            <label>
              <input type="checkbox" checked={mergeIntent} onChange={(e) => setMergeIntent(e.target.checked)} />
              Flag merge intent
            </label>
          </div>
        )}
        <label>
          First name
          <input
            name="firstName"
            value={values.firstName}
            onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
            required
          />
        </label>
        <label>
          Last name
          <input
            name="lastName"
            value={values.lastName}
            onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
            required
          />
        </label>
        <label>
          Email (optional)
          <input
            name="email"
            value={values.email ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            aria-invalid={Boolean(validation.errors.email)}
          />
        </label>
        <label>
          Area (optional)
          <input
            name="residentialArea"
            value={values.residentialArea ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, residentialArea: e.target.value }))}
          />
        </label>
        {/* AC3: no PIN field — credential is set later via OTP. */}
        <button type="submit" disabled={!canSubmit(validation, phoneCheck)}>
          Create parent
        </button>
      </form>
    </main>
  );
}
