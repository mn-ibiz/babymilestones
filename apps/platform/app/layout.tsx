import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/seo";
import "./globals.css";

/**
 * Root metadata defaults (Story 36.2 AC2). `metadataBase` resolves relative OG /
 * Twitter image paths to absolute URLs site-wide; the title template brands every
 * page, and `%s` is filled by each page's own `buildMetadata({ title })`. Public
 * pages override description/canonical/OG via their own `generateMetadata`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
