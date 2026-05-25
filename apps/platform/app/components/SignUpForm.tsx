"use client";

import { useState } from "react";
import Link from "next/link";
import { emptySignUp, signInHref, validateSignUp, type SignUpDraft } from "../../lib/auth-form";
import { submitSignUp } from "../../lib/auth-api";

export interface SignUpFormProps {
  /** Intended post-auth destination (`?next=`), already open-redirect-guarded. */
  dest: string;
  /** Called on a successful signup; the page navigates to `dest`. */
  onAuthed: () => void;
}

/**
 * Parent sign-up form (P1-E12-S04 AC3). Mobile-first, phone + PIN + confirm.
 * Client-side validation runs the tested pure {@link validateSignUp} (mirrors
 * the API order: phone → PIN format → confirm → weak PIN). The API re-validates,
 * owns duplicate-phone detection, and sets the SSO session cookie on success.
 * A duplicate phone is mapped to a "you already have an account" notice with a
 * sign-in link so the parent never dead-ends (signup 1-1 AC2).
 */
export function SignUpForm({ dest, onAuthed }: SignUpFormProps) {
  const [draft, setDraft] = useState<SignUpDraft>(emptySignUp);
  const [errors, setErrors] = useState<Partial<Record<keyof SignUpDraft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [steerToSignIn, setSteerToSignIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof SignUpDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSteerToSignIn(false);
    const found = validateSignUp(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const res = await submitSignUp(draft);
      if (res.ok) {
        onAuthed();
        return;
      }
      if (res.error.redirectToSignIn) {
        setSteerToSignIn(true);
        setFormError(res.error.message);
      } else if (res.error.field) {
        setErrors({ [res.error.field]: res.error.message } as Partial<Record<keyof SignUpDraft, string>>);
      } else {
        setFormError(res.error.message);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const signInTarget = signInHref(dest === "/home" ? null : dest);

  return (
    <form onSubmit={submit} aria-label="Sign up" className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">Create your account</h1>

      <label className="flex flex-col gap-1 text-sm">
        Phone number
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="07XX XXX XXX"
          value={draft.phone}
          onChange={set("phone")}
          className="rounded-lg border border-ink/20 px-3 py-2"
        />
      </label>
      {errors.phone && <p role="alert" className="text-sm text-danger">{errors.phone}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Choose a 4-digit PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={draft.pin}
          onChange={set("pin")}
          className="rounded-lg border border-ink/20 px-3 py-2"
        />
      </label>
      {errors.pin && <p role="alert" className="text-sm text-danger">{errors.pin}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Confirm PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={draft.pinConfirm}
          onChange={set("pinConfirm")}
          className="rounded-lg border border-ink/20 px-3 py-2"
        />
      </label>
      {errors.pinConfirm && <p role="alert" className="text-sm text-danger">{errors.pinConfirm}</p>}

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
          {steerToSignIn && (
            <>
              {" "}
              <Link href={signInTarget} className="underline">Go to sign in</Link>
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-surface hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>

      <p className="text-sm text-ink/70">
        Already have an account? <Link href={signInTarget} className="underline">Sign in</Link>
      </p>
    </form>
  );
}
