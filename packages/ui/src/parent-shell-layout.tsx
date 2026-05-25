/**
 * `ParentShellLayout` (X7-S03) — the parent dashboard shell: a bottom/side nav
 * of the four parent tabs plus a content region. It composes the pure nav model
 * from `./parent-shell` ({@link PARENT_NAV_ITEMS} + {@link isNavItemActive}) so
 * the active-tab rule lives in exactly one place. Framework-free anchors (`<a>`)
 * keep `@bm/ui` dependency-light; apps can supply a custom `renderLink` to wire
 * Next's `<Link>`. Composed from brand tokens only.
 */
import * as React from "react";
import { cn } from "./cn.js";
import {
  PARENT_NAV_ITEMS,
  isNavItemActive,
  type ParentNavItem,
} from "./parent-shell.js";

export interface ParentShellLayoutProps {
  /** Current pathname, used to resolve the active tab. */
  pathname: string;
  /** Page content. */
  children: React.ReactNode;
  /** Optional nav-item override (defaults to the four canonical tabs). */
  navItems?: readonly ParentNavItem[];
  /** Render a custom link (e.g. Next `<Link>`); defaults to a plain anchor. */
  renderLink?: (item: ParentNavItem, props: LinkRenderProps) => React.ReactNode;
  className?: string;
}

export interface LinkRenderProps {
  href: string;
  active: boolean;
  "aria-current"?: "page";
  className: string;
  children: React.ReactNode;
}

export function ParentShellLayout({
  pathname,
  children,
  navItems = PARENT_NAV_ITEMS,
  renderLink,
  className,
}: ParentShellLayoutProps) {
  return (
    <div className={cn("flex min-h-dvh flex-col bg-neutral-50", className)}>
      <main className="flex-1 p-4">{children}</main>
      <nav
        aria-label="Parent navigation"
        className="sticky bottom-0 grid grid-cols-4 border-t border-neutral-200 bg-white"
      >
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          const linkProps: LinkRenderProps = {
            href: item.href,
            active,
            "aria-current": active ? "page" : undefined,
            className: cn(
              "flex flex-col items-center gap-1 py-2 text-xs",
              active ? "text-primary-600 font-medium" : "text-neutral-500",
            ),
            children: item.label,
          };
          if (renderLink) {
            return (
              <React.Fragment key={item.key}>
                {renderLink(item, linkProps)}
              </React.Fragment>
            );
          }
          const { active: _active, ...anchorProps } = linkProps;
          void _active;
          return (
            <a key={item.key} {...anchorProps}>
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
