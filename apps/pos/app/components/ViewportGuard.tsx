"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TABLET_MIN_WIDTH, supportsPosLayout } from "../../lib/layout";

/**
 * Enforces the AC3 layout contract at runtime (P2-E04-S01): the POS till is a
 * landscape, >= 768px surface. On a portrait or too-narrow viewport this renders
 * a "rotate / use a wider screen" notice instead of the landscape-only two-pane
 * till, which would otherwise overflow. The decision is the tested pure
 * `supportsPosLayout`; this component only wires it to the live viewport.
 *
 * Before mount (and during SSR) we render children optimistically so the server
 * markup and first paint match — the guard engages on the client once the real
 * viewport is known, avoiding a hydration mismatch.
 */
export function ViewportGuard({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const evaluate = () => setSupported(supportsPosLayout(window.innerWidth, window.innerHeight));
    evaluate();
    window.addEventListener("resize", evaluate);
    window.addEventListener("orientationchange", evaluate);
    return () => {
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("orientationchange", evaluate);
    };
  }, []);

  if (!supported) {
    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <h2 className="text-lg font-semibold">Rotate to landscape</h2>
        <p className="text-sm text-ink/70">
          The POS is designed for a landscape tablet at least {TABLET_MIN_WIDTH}px wide.
          Rotate the device or use a wider screen to continue.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
