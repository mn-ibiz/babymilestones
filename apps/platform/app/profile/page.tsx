"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { draftFromProfile, type ProfileDraft } from "../../lib/profile";
import { fetchProfile, setSmsConsent } from "../../lib/profile-api";
import { ProfileForm } from "../components/ProfileForm";
import { ExportDataButton } from "../components/ExportDataButton";

/**
 * Dashboard profile edit (P1-E02-S01 AC4). Reachable from the dashboard at any
 * time; seeds the form from the current profile when one exists. Also surfaces
 * the SMS marketing opt-in (P1-E02-S04 AC1) as a standalone toggle so a consent
 * change is never bundled into the profile upsert.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [initial, setInitial] = useState<ProfileDraft | undefined>(undefined);
  const [smsOptIn, setSmsOptIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchProfile()
      .then((state) => {
        if (!active) return;
        if (state.profile) {
          setInitial(draftFromProfile(state.profile));
          setSmsOptIn(state.profile.smsMarketingOptIn);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSmsConsent(next: boolean) {
    const state = await setSmsConsent(next);
    if (state.profile) setSmsOptIn(state.profile.smsMarketingOptIn);
  }

  if (loading) return <main>Loading…</main>;

  return (
    <main>
      <h1>Your profile</h1>
      <ProfileForm initial={initial} onSaved={() => router.push("/dashboard")} />

      {smsOptIn !== null && (
        <section aria-label="Communication preferences">
          <h2>Communication preferences</h2>
          <label>
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(e) => handleSmsConsent(e.target.checked)}
            />
            Send me marketing SMS messages
          </label>
        </section>
      )}

      <ExportDataButton />
    </main>
  );
}
