import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "POS · Baby Milestones" };

/**
 * Tablet-first viewport (P2-E04-S01 AC3): the POS is an in-store tablet app in
 * landscape. We fit the device width but do NOT cap `maximumScale` — disabling
 * pinch-zoom fails WCAG 1.4.4 (resize text) and would block low-vision operators.
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
