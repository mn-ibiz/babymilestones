import Link from "next/link";
import type { ParentProfile } from "@bm/contracts";
import { shouldShowCompletionBanner } from "../../lib/profile";

/**
 * Profile-completion banner (P1-E02-S01 AC3). Renders nothing once the profile
 * is complete; otherwise nudges the parent to the dashboard edit (AC4).
 */
export function CompletionBanner({ profile }: { profile: ParentProfile | null | undefined }) {
  if (!shouldShowCompletionBanner(profile)) return null;
  return (
    <div role="status" aria-label="Complete your profile">
      <p>Your profile is incomplete. Add your name so we know who you are.</p>
      <Link href="/profile">Complete profile</Link>
    </div>
  );
}
