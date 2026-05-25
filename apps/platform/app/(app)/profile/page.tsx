"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { draftFromProfile, type ProfileDraft } from "../../../lib/profile";
import { fetchProfile, setSmsConsent } from "../../../lib/profile-api";
import { ProfileForm } from "../../components/ProfileForm";
import { PinChangeForm } from "../../components/PinChangeForm";
import { ExportDataButton } from "../../components/ExportDataButton";

/**
 * Parent profile & consent management (P1-E11-S04). Mobile-first, inside the
 * authed `(app)` route group. Lets a parent edit their details (AC1), toggle
 * SMS marketing consent (AC2 — a standalone toggle, never bundled into the
 * profile upsert), change their PIN (AC3), and request a full data export
 * (AC4). All mutations carry the CSRF double-submit token; the server enforces
 * ownership + CSRF.
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
      <ProfileForm initial={initial} onSaved={() => router.refresh()} />

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

      <section aria-label="Security">
        {/* AC3: a successful PIN change invalidates every session — bounce to login. */}
        <PinChangeForm onChanged={() => router.push("/login")} />
      </section>

      <ExportDataButton />
    </main>
  );
}
