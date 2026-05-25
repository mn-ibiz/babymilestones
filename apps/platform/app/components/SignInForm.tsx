"use client";

import { useState } from "react";
import Link from "next/link";
import { emptySignIn, signUpHref, validateSignIn, type SignInDraft } from "../../lib/auth-form";
import { submitSignIn } from "../../lib/auth-api";

export interface SignInFormProps {
  /** Intended post-auth destination (`?next=`), already open-redirect-guarded. */
  dest: string;
  /** Called on a successful sign-in; the page navigates to `dest`. */
  onAuthed: () => void;
}

/**
 * Parent sign-in form (P1-E12-S04 AC3). Mobile-first, phone + PIN. Client-side
 * validation runs the tested pure {@link validateSignIn}; the API is the sole
 * authority on credentials and sets the SSO session cookie on success. Error
 * messaging is mapped straight from the API (invalid credentials, rate-limit).
 */
export function SignInForm({ dest, onAuthed }: SignInFormProps) {
  const [draft, setDraft] = useState<SignInDraft>(emptySignIn);
  const [errors, setErrors] = useState<Partial<Record<keyof SignInDraft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof SignInDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validateSignIn(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const res = await submitSignIn(draft);
      if (res.ok) {
        onAuthed();
        return;
      }
      if (res.error.field) {
        setErrors({ [res.error.field]: res.error.message } as Partial<Record<keyof SignInDraft, string>>);
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
    <form onSubmit={submit} aria-label="Sign in" className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">Sign in</h1>

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
        PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          value={draft.pin}
          onChange={set("pin")}
          className="rounded-lg border border-ink/20 px-3 py-2"
        />
      </label>
      {errors.pin && <p role="alert" className="text-sm text-danger">{errors.pin}</p>}

      {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-brand px-4 py-2 font-medium text-surface hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-sm text-ink/70">
        <Link href="/forgot" className="underline">Forgot your PIN?</Link>
      </p>
      <p className="text-sm text-ink/70">
        New here? <Link href={signUpHref(dest === "/home" ? null : dest)} className="underline">Create an account</Link>
      </p>
    </form>
  );
}
