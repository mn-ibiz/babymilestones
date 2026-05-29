"use client";

import { useRouter } from "next/navigation";
import { StaffLoginForm } from "../components/StaffLoginForm";
import { FORBIDDEN_PATH, posLanding } from "../../lib/pos-access";

/**
 * POS staff login page (P2-E04-S01). Public per `middleware.ts`. On a successful
 * sign-in the operator is routed by `posLanding`: a POS role lands directly on
 * the sale screen (AC2 — "log in and start selling"); any other staff role
 * (which the API still authenticates) goes straight to /forbidden instead of
 * flashing through the till.
 */
export default function PosLoginPage() {
  const router = useRouter();
  return (
    <main>
      <StaffLoginForm onAuthed={(role) => router.push(posLanding(role) ?? FORBIDDEN_PATH)} />
    </main>
  );
}
