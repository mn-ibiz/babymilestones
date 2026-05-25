import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Button } from "./button.js";
import { Input } from "./input.js";
import { MoneyInput } from "./money-input.js";
import { PhoneInput } from "./phone-input.js";
import { OTPInput } from "./otp-input.js";
import { BottomSheet } from "./bottom-sheet.js";
import { Toast } from "./toast.js";
import { Spinner } from "./spinner.js";
import { Skeleton } from "./skeleton.js";
import { ChipGroup } from "./chip-group.js";

describe("Button", () => {
  it("renders a native button with a visible focus ring", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveClass("focus-visible:ring-2");
  });

  it("applies variant + size classes from the brand tokens", () => {
    render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn).toHaveClass("bg-danger");
    expect(btn).toHaveClass("h-12");
  });

  it("is keyboard-activatable and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("loading state disables and exposes aria-busy + a status spinner", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("renders and accepts typed text", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" />);
    const input = screen.getByLabelText("Name");
    await user.type(input, "Ada");
    expect(input).toHaveValue("Ada");
  });

  it("wires the invalid state to aria-invalid + danger border", () => {
    render(<Input aria-label="Name" invalid />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("border-danger");
  });
});

describe("MoneyInput", () => {
  it("displays integer cents as a decimal with a KES affix", () => {
    render(
      <MoneyInput aria-label="Amount" valueCents={50000} onValueChange={() => {}} />,
    );
    expect(screen.getByLabelText("Amount")).toHaveValue("500.00");
    expect(screen.getByText("KES")).toBeInTheDocument();
  });

  it("emits integer cents (never a float) on input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <MoneyInput aria-label="Amount" valueCents={null} onValueChange={onValueChange} />,
    );
    await user.type(screen.getByLabelText("Amount"), "5");
    expect(onValueChange).toHaveBeenLastCalledWith(500);
    expect(Number.isInteger(onValueChange.mock.calls.at(-1)![0])).toBe(true);
  });
});

describe("PhoneInput", () => {
  it("shows the KE flag and +254 affix", () => {
    render(<PhoneInput aria-label="Phone" value="" onValueChange={() => {}} />);
    expect(screen.getByLabelText("Kenya")).toBeInTheDocument();
    expect(screen.getByText("+254")).toBeInTheDocument();
  });

  it("formats KE numbers and emits the E.164 value", () => {
    const onValueChange = vi.fn();
    function Harness() {
      const [v, setV] = useState("");
      return (
        <PhoneInput
          aria-label="Phone"
          value={v}
          onValueChange={(raw, e164) => {
            setV(raw);
            onValueChange(raw, e164);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText("Phone");
    // Fire a complete number as a single change event.
    fireEvent.change(input, { target: { value: "0712345678" } });
    expect(onValueChange).toHaveBeenLastCalledWith("0712345678", "+254712345678");
  });
});

describe("OTPInput", () => {
  it("renders one box per digit as a labelled group", () => {
    render(<OTPInput value="" onValueChange={() => {}} length={4} />);
    expect(screen.getByRole("group", { name: "One-time code" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  it("advances focus as digits are typed", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState("");
      return <OTPInput value={v} onValueChange={setV} length={4} />;
    }
    render(<Harness />);
    const boxes = screen.getAllByRole("textbox");
    boxes[0]!.focus();
    await user.keyboard("1");
    expect(boxes[1]).toHaveFocus();
  });
});

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(<BottomSheet open={false} onClose={() => {}} title="Sheet" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled modal dialog when open", () => {
    render(
      <BottomSheet open onClose={() => {}} title="Top up">
        body
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Top up" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="Sheet" />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Toast", () => {
  it("uses role=status for non-danger variants", () => {
    render(<Toast message="Saved" variant="success" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("escalates danger to role=alert and supports dismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Toast message="Oops" variant="danger" onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("Spinner", () => {
  it("exposes role=status with an accessible label", () => {
    render(<Spinner label="Fetching" />);
    expect(screen.getByRole("status", { name: "Fetching" })).toHaveClass(
      "animate-spin",
    );
  });
});

describe("Skeleton", () => {
  it("renders an aria-hidden pulsing placeholder", () => {
    render(<Skeleton className="h-4 w-20" />);
    const el = screen.getByTestId("skeleton");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("animate-pulse");
  });
});

describe("ChipGroup", () => {
  const options = [
    { value: "100", label: "KES 100" },
    { value: "500", label: "KES 500" },
  ];

  it("renders a radiogroup with the selected chip checked", () => {
    render(
      <ChipGroup label="Amount" options={options} value="500" onValueChange={() => {}} />,
    );
    expect(screen.getByRole("radiogroup", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "KES 500" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "KES 500" })).toHaveClass(
      "bg-primary-500",
    );
  });

  it("selects on keyboard activation", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ChipGroup
        label="Amount"
        options={options}
        value={null}
        onValueChange={onValueChange}
      />,
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "KES 100" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("100");
  });
});
