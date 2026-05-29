"use client";

import { useState } from "react";
import {
  emptyStaffLogin,
  validateStaffLogin,
  type StaffLoginDraft,
} from "../../lib/staff-login";
import { submitStaffSignIn } from "../../lib/auth-api";

export interface StaffLoginFormProps {
  /**
   * Called on a successful sign-in with the authenticated role; the page routes
   * the operator to the right surface (sale screen, or /forbidden for a staff
   * role with no POS access).
   */
  onAuthed: (role: string) => void;
}

/**
 * POS staff sign-in form (P2-E04-S01). Tablet-first, phone + PIN, large touch
 * targets (AC3). Client-side validation runs the tested pure
 * {@link validateStaffLogin}; the API is the sole authority on credentials and
 * sets the SSO session cookie on success. On success the page lands the operator
 * on the sale screen (AC2).
 */
export function StaffLoginForm({ onAuthed }: StaffLoginFormProps) {
  const [draft, setDraft] = useState<StaffLoginDraft>(emptyStaffLogin);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffLoginDraft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Clear the field's stale error (and any form-level error) as the operator
  // corrects it, rather than leaving it until the next submit.
  const set = (key: keyof StaffLoginDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setFormError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // guard against a double-tap / held-Enter double POST
    setFormError(null);
    const found = validateStaffLogin(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const res = await submitStaffSignIn(draft);
      if (res.ok) {
        onAuthed(res.role);
        return;
      }
      if (res.error.field) {
        setErrors({ [res.error.field]: res.error.message });
      } else {
        setFormError(res.error.message);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Till sign in" className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-12">
      <h1 className="text-2xl font-semibold text-ink">Till sign in</h1>

      <label className="flex flex-col gap-1 text-sm">
        Phone number
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="07XX XXX XXX"
          value={draft.phone}
          onChange={set("phone")}
          className="touch-target rounded-lg border border-ink/20 px-3"
        />
      </label>
      {errors.phone && <p role="alert" className="text-sm text-danger">{errors.phone}</p>}

      <label className="flex flex-col gap-1 text-sm">
        PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          value={draft.pin}
          onChange={set("pin")}
          className="touch-target rounded-lg border border-ink/20 px-3"
        />
      </label>
      {errors.pin && <p role="alert" className="text-sm text-danger">{errors.pin}</p>}

      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="touch-target rounded-lg bg-brand px-4 font-medium text-surface hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
