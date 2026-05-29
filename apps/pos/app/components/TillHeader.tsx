import { SignOutButton } from "./SignOutButton";

/**
 * POS till header (P2-E04-S01 AC3). The signed-in operator + surface label on
 * the left, the real sign-out control on the right (clears the SSO session, see
 * {@link SignOutButton}). A server component — the only client island is the
 * sign-out button — sized with large touch targets for in-store taps.
 */
export interface TillHeaderProps {
  operatorName: string;
  surface: string;
}

export function TillHeader({ operatorName, surface }: TillHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-ink/10 bg-surface px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-ink">Baby Milestones POS</span>
        <span className="text-sm text-ink/60">{surface}</span>
      </div>
      <div className="flex items-center gap-3">
        {operatorName && <span className="text-sm text-ink/70">{operatorName}</span>}
        <a
          href="/cashup"
          className="touch-target inline-flex items-center rounded-lg border border-ink/20 px-4 text-sm font-medium"
        >
          End of day
        </a>
        <SignOutButton />
      </div>
    </header>
  );
}
