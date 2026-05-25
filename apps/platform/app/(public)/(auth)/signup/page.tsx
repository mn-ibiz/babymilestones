"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignUpForm } from "../../../components/SignUpForm";
import { resolvePostAuthDest } from "../../../../lib/auth-form";

/**
 * Public sign-up page (P1-E12-S04) at `/signup`. Reads the intended destination
 * from `?next=` (a deep-link funnel may carry e.g. `/book/talent`), resolves it
 * through the open-redirect guard, and on a successful signup navigates there
 * (AC2) — defaulting to the dashboard. The opaque-token SSO session cookie is
 * set by the API on success.
 */
function SignUpPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const dest = resolvePostAuthDest(search?.get("next"));
  return <SignUpForm dest={dest} onAuthed={() => router.push(dest)} />;
}

export default function SignUpPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <SignUpPageInner />
      </Suspense>
    </main>
  );
}
