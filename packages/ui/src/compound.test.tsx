import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  Child,
  MpesaStkState,
  RecentTransaction,
  WalletOverview,
} from "@bm/contracts";
import { WalletBalanceCard } from "./wallet-balance-card.js";
import { OutstandingBalanceBanner } from "./outstanding-balance-banner.js";
import { AutoCreditStatus } from "./auto-credit-status.js";
import { ChildCard } from "./child-card.js";
import { MpesaPushPrompt } from "./mpesa-push-prompt.js";
import { ReceiptPreview } from "./receipt-preview-card.js";
import { ParentShellLayout } from "./parent-shell-layout.js";
import { StaffShellLayout } from "./staff-shell-layout.js";
import type { ReceiptDocument } from "./receipt-document.js";

const wallet: WalletOverview = {
  balanceCents: 50000,
  outstandingCents: 12000,
  autoCreditEnabled: false,
  loyaltyPoints: 30,
  recentTransactions: [
    {
      id: "t1",
      createdAt: "2026-05-24T10:00:00.000Z",
      kind: "topup",
      direction: "credit",
      amountCents: 50000,
      source: "mpesa",
      balanceAfterCents: 50000,
    } satisfies RecentTransaction,
  ],
};

const child: Child = {
  id: "c1",
  firstName: "Amara",
  lastName: "Otieno",
  dateOfBirth: "2023-01-15",
  gender: "female",
  allergiesNotes: "Peanuts",
  photoConsent: true,
  archivedAt: null,
  ageInMonths: 28,
};

const receipt: ReceiptDocument = {
  displayNumber: "BM-2026-000123",
  date: "2026-05-24T10:00:00.000Z",
  paymentMethod: "M-Pesa",
  maskedPhone: "••••5678",
  customerName: "Amara Otieno",
  lines: [
    { description: "Soft play — 2h", quantity: 1, unitPrice: 50000, lineTax: 0, lineTotal: 50000 },
  ],
  total: 50000,
  taxTotal: 0,
  business: {
    name: "Baby Milestones",
    addressLines: ["Nairobi, Kenya"],
    phone: "+254 700 000 000",
    kraPin: null,
  },
};

describe("WalletBalanceCard", () => {
  it("renders the balance, outstanding and loyalty from typed props", () => {
    render(<WalletBalanceCard wallet={wallet} />);
    expect(screen.getByText("KES 500.00")).toBeInTheDocument();
    // Outstanding > 0 → flagged region.
    expect(screen.getByText("KES 120.00")).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });

  it("flags outstanding with the danger token only when owed > 0", () => {
    const { rerender } = render(<WalletBalanceCard wallet={wallet} />);
    expect(screen.getByTestId("wallet-outstanding")).toHaveClass("text-danger");
    rerender(
      <WalletBalanceCard wallet={{ ...wallet, outstandingCents: 0 }} />,
    );
    expect(screen.getByTestId("wallet-outstanding")).not.toHaveClass("text-danger");
  });

  it("matches the visual snapshot", () => {
    const { container } = render(<WalletBalanceCard wallet={wallet} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("OutstandingBalanceBanner (P2-E07-S01)", () => {
  it("AC1: shows the owed amount and the settle nudge when outstanding > 0", () => {
    render(<OutstandingBalanceBanner outstandingCents={12000} />);
    const banner = screen.getByRole("status", { name: /outstanding/i });
    expect(banner).toHaveTextContent("You owe KES 120.00. Top up to settle.");
  });

  it("AC2: the CTA links to the top-up flow", () => {
    render(<OutstandingBalanceBanner outstandingCents={12000} />);
    expect(screen.getByRole("link", { name: /top up/i })).toHaveAttribute("href", "/top-up");
  });

  it("AC2: the CTA target is overridable", () => {
    render(
      <OutstandingBalanceBanner outstandingCents={12000} topUpHref="/top-up#mpesa-heading" />,
    );
    expect(screen.getByRole("link", { name: /top up/i })).toHaveAttribute(
      "href",
      "/top-up#mpesa-heading",
    );
  });

  it("AC3: renders nothing once the balance is settled (outstanding 0)", () => {
    const { container } = render(<OutstandingBalanceBanner outstandingCents={0} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("AC3: renders nothing for a non-positive (credit) balance", () => {
    const { container } = render(<OutstandingBalanceBanner outstandingCents={-5000} />);
    expect(container.firstChild).toBeNull();
  });

  it("matches the visual snapshot", () => {
    const { container } = render(<OutstandingBalanceBanner outstandingCents={12000} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("AutoCreditStatus (P2-E07-S03: read-only auto-credit visibility)", () => {
  it("AC1: enabled → 'Auto-credit: Enabled by admin', no helper copy", () => {
    render(<AutoCreditStatus enabled />);
    expect(
      screen.getByText("Auto-credit: Enabled by admin"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Top up before booking to avoid an outstanding balance",
      ),
    ).toBeNull();
  });

  it("AC1: disabled → 'Auto-credit: Not enabled'", () => {
    render(<AutoCreditStatus enabled={false} />);
    expect(screen.getByText("Auto-credit: Not enabled")).toBeInTheDocument();
  });

  it("AC2: disabled → explains exactly how to avoid an outstanding balance", () => {
    render(<AutoCreditStatus enabled={false} />);
    expect(
      screen.getByText(
        "Top up before booking to avoid an outstanding balance",
      ),
    ).toBeInTheDocument();
  });

  it("AC3: no edit affordance for the parent in either state", () => {
    const { rerender } = render(<AutoCreditStatus enabled={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    rerender(<AutoCreditStatus enabled />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("matches the visual snapshot (disabled, with helper copy)", () => {
    const { container } = render(<AutoCreditStatus enabled={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("ChildCard", () => {
  it("renders the child name, age and allergy flag from typed props", () => {
    render(<ChildCard child={child} />);
    expect(screen.getByText("Amara Otieno")).toBeInTheDocument();
    expect(screen.getByText(/2 yrs/)).toBeInTheDocument();
    expect(screen.getByText(/Peanuts/)).toBeInTheDocument();
  });

  it("matches the visual snapshot", () => {
    const { container } = render(<ChildCard child={child} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("MpesaPushPrompt", () => {
  it("shows a polite status for the pending push states", () => {
    render(<MpesaPushPrompt state="STK_SENT" amountKes={500} phone="+254712345678" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  it("escalates the failed/expired states to an alert", () => {
    const states: MpesaStkState[] = ["FAILED", "EXPIRED"];
    for (const state of states) {
      const { unmount } = render(<MpesaPushPrompt state={state} amountKes={500} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      unmount();
    }
  });

  it("matches the visual snapshot", () => {
    const { container } = render(
      <MpesaPushPrompt state="STK_SENT" amountKes={500} phone="+254712345678" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("ReceiptPreview", () => {
  it("renders the receipt facts from the typed document", () => {
    render(<ReceiptPreview receipt={receipt} />);
    expect(screen.getByText("BM-2026-000123")).toBeInTheDocument();
    expect(screen.getByText("Soft play — 2h")).toBeInTheDocument();
    expect(screen.getByText("••••5678")).toBeInTheDocument();
    // Never the full phone.
    expect(screen.queryByText(/712345678/)).toBeNull();
  });

  it("matches the visual snapshot", () => {
    const { container } = render(<ReceiptPreview receipt={receipt} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("ParentShellLayout", () => {
  it("renders the four parent tabs with the active one marked current", () => {
    render(
      <ParentShellLayout pathname="/wallet">
        <p>page body</p>
      </ParentShellLayout>,
    );
    expect(screen.getByRole("navigation", { name: /parent/i })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    const active = screen.getByRole("link", { name: "Wallet" });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("matches the visual snapshot", () => {
    const { container } = render(
      <ParentShellLayout pathname="/home">
        <p>body</p>
      </ParentShellLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("StaffShellLayout", () => {
  const items = [
    { key: "reception", label: "Reception", href: "/reception" },
    { key: "receipts", label: "Receipts", href: "/receipts" },
  ];

  it("renders the staff nav, title and active item", () => {
    render(
      <StaffShellLayout title="Reception" pathname="/reception" navItems={items}>
        <p>staff body</p>
      </StaffShellLayout>,
    );
    expect(screen.getByRole("navigation", { name: /staff/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reception" })).toBeInTheDocument();
    expect(screen.getByText("staff body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reception" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("matches the visual snapshot", () => {
    const { container } = render(
      <StaffShellLayout title="Receipts" pathname="/receipts" navItems={items}>
        <p>body</p>
      </StaffShellLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
