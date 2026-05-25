import type { ReactNode } from "react";

/**
 * Public (marketing) route group layout (P1-E12-S01). A bare server-component
 * shell — no auth chrome, no client JS — so the marketing surface stays lean
 * and SSR-rendered for SEO and a fast LCP on 3G (AC4).
 */
export default function PublicGroupLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-surface text-ink">{children}</div>;
}
