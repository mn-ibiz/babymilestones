"use client";

import { useRouter } from "next/navigation";
import { ProfileForm } from "../../components/ProfileForm";

/**
 * Inline profile capture shown right after PIN setup (P1-E02-S01 AC1, AC3).
 * Skippable — on skip we land on the dashboard, where the completion banner
 * keeps nudging until the profile is done.
 */
export default function WelcomeProfilePage() {
  const router = useRouter();
  return (
    <main>
      <h1>Tell us about you</h1>
      <ProfileForm
        allowSkip
        onSaved={() => router.push("/dashboard")}
        onSkip={() => router.push("/dashboard")}
      />
    </main>
  );
}
