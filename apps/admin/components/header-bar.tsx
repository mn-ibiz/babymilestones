import type { HeaderViewModel } from "../lib/nav";

/**
 * Server-rendered console header (P1-E10-S01 AC3): current user, role badge,
 * float status dot (green/red from P1-E06), and a logout action. Presentational
 * only — the view-model is built by `headerViewModel(...)` in the layout.
 */
export function HeaderBar({ vm }: { vm: HeaderViewModel }) {
  const { floatDot } = vm;
  return (
    <header>
      <span data-testid="user-name">{vm.userName}</span>
      <span data-testid="role-badge">{vm.roleBadge}</span>
      <span
        role="status"
        aria-label={floatDot.label}
        title={floatDot.label}
        data-float={floatDot.color}
        style={{
          display: "inline-block",
          width: "0.6rem",
          height: "0.6rem",
          borderRadius: "9999px",
          backgroundColor: floatDot.color === "green" ? "#16a34a" : "#dc2626",
        }}
      />
      <a href={vm.logoutHref}>Logout</a>
    </header>
  );
}
