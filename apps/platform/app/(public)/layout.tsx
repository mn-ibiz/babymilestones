import { Suspense, type ReactNode } from "react";
import { PublicHeader } from "../components/PublicHeader";

/**
 * Public (marketing) route group layout (P1-E12-S01). A lean server-component
 * shell — SSR-rendered for SEO and a fast LCP on 3G (AC4). Hosts the shared
 * public header whose "Sign in" / "Sign up" CTAs appear on every public page
 * (P1-E12-S04 AC1). The header reads the current location via `useSearchParams`,
 * so it's wrapped in a Suspense boundary as Next 15 requires.
 */
export default function PublicGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <Suspense fallback={null}>
        <PublicHeader />
      </Suspense>
      {children}
    </div>
  );
}
