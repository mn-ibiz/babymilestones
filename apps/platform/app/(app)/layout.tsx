import type { ReactNode } from "react";
import { ParentShellLayout } from "../components/ParentShellLayout";

/**
 * Authed parent route group layout (P1-E11-S05). Wraps Home / Wallet / Children
 * / Profile in the mobile-first {@link ParentShellLayout}: 4-tab bottom nav on
 * mobile, sidebar on desktop (AC1). The shell is a server component, so this
 * layer adds no client JS beyond the small nav island (AC3).
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <ParentShellLayout>{children}</ParentShellLayout>;
}
