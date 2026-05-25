"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignInForm } from "../../../components/SignInForm";
import { resolvePostAuthDest } from "../../../../lib/auth-form";

/**
 * Public sign-in page (P1-E12-S04) at `/login`. Reads the intended destination
 * from `?next=`, resolves it through the open-redirect guard, and on a
 * successful sign-in navigates there (AC2) — defaulting to the dashboard.
 */
function SignInPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const dest = resolvePostAuthDest(search?.get("next"));
  return <SignInForm dest={dest} onAuthed={() => router.push(dest)} />;
}

export default function SignInPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <SignInPageInner />
      </Suspense>
    </main>
  );
}
