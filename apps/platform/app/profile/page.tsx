"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { draftFromProfile, type ProfileDraft } from "../../lib/profile";
import { fetchProfile } from "../../lib/profile-api";
import { ProfileForm } from "../components/ProfileForm";

/**
 * Dashboard profile edit (P1-E02-S01 AC4). Reachable from the dashboard at any
 * time; seeds the form from the current profile when one exists.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [initial, setInitial] = useState<ProfileDraft | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchProfile()
      .then((state) => {
        if (active && state.profile) setInitial(draftFromProfile(state.profile));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <main>Loading…</main>;

  return (
    <main>
      <h1>Your profile</h1>
      <ProfileForm initial={initial} onSaved={() => router.push("/dashboard")} />
    </main>
  );
}
