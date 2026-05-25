/**
 * Storybook entries for every X7-S02 primitive (AC3). Authored in CSF; one
 * `Meta` + at least one `StoryObj` per primitive. Controlled primitives use a
 * small stateful `render` so the stories are interactive in the Storybook host.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "./storybook-types.js";
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

// ── Button ──────────────────────────────────────────────────────────────────
const buttonMeta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Top up" },
};
export default buttonMeta;
export const ButtonPrimary: StoryObj<typeof buttonMeta> = {
  args: { variant: "primary" },
};
export const ButtonDanger: StoryObj<typeof buttonMeta> = {
  args: { variant: "danger", children: "Delete" },
};
export const ButtonLoading: StoryObj<typeof buttonMeta> = {
  args: { loading: true },
};

// ── Input ─────────────────────────────────────────────────────────────────--
export const InputDefault: StoryObj<Meta<typeof Input>> = {
  name: "Input / Default",
  render: () => <Input aria-label="Name" placeholder="Jane Doe" />,
};
export const InputInvalid: StoryObj<Meta<typeof Input>> = {
  name: "Input / Invalid",
  render: () => <Input aria-label="Name" invalid defaultValue="!" />,
};

// ── MoneyInput ────────────────────────────────────────────────────────────--
export const MoneyInputDefault: StoryObj<Meta<typeof MoneyInput>> = {
  name: "MoneyInput / KES",
  render: () => {
    const [cents, setCents] = useState<number | null>(50000);
    return (
      <MoneyInput aria-label="Amount" valueCents={cents} onValueChange={setCents} />
    );
  },
};

// ── PhoneInput ────────────────────────────────────────────────────────────--
export const PhoneInputDefault: StoryObj<Meta<typeof PhoneInput>> = {
  name: "PhoneInput / KE",
  render: () => {
    const [v, setV] = useState("");
    return <PhoneInput aria-label="Phone" value={v} onValueChange={(raw) => setV(raw)} />;
  },
};

// ── OTPInput ──────────────────────────────────────────────────────────────--
export const OTPInputDefault: StoryObj<Meta<typeof OTPInput>> = {
  name: "OTPInput / 6 digits",
  render: () => {
    const [v, setV] = useState("");
    return <OTPInput value={v} onValueChange={setV} />;
  },
};

// ── BottomSheet ───────────────────────────────────────────────────────────--
export const BottomSheetDefault: StoryObj<Meta<typeof BottomSheet>> = {
  name: "BottomSheet / Open",
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open sheet</Button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Top up wallet">
          <p>Sheet body content.</p>
        </BottomSheet>
      </>
    );
  },
};

// ── Toast ─────────────────────────────────────────────────────────────────--
export const ToastSuccess: StoryObj<Meta<typeof Toast>> = {
  name: "Toast / Success",
  render: () => <Toast message="Wallet topped up" variant="success" />,
};
export const ToastDanger: StoryObj<Meta<typeof Toast>> = {
  name: "Toast / Danger",
  render: () => <Toast message="Payment failed" variant="danger" onDismiss={() => {}} />,
};

// ── Spinner ───────────────────────────────────────────────────────────────--
export const SpinnerDefault: StoryObj<Meta<typeof Spinner>> = {
  name: "Spinner / Default",
  render: () => <Spinner />,
};

// ── Skeleton ──────────────────────────────────────────────────────────────--
export const SkeletonDefault: StoryObj<Meta<typeof Skeleton>> = {
  name: "Skeleton / Line",
  render: () => <Skeleton className="h-4 w-40" />,
};

// ── ChipGroup ─────────────────────────────────────────────────────────────--
export const ChipGroupDefault: StoryObj<Meta<typeof ChipGroup>> = {
  name: "ChipGroup / Amounts",
  render: () => {
    const [v, setV] = useState<string | null>("500");
    return (
      <ChipGroup
        label="Quick top-up"
        value={v}
        onValueChange={setV}
        options={[
          { value: "100", label: "KES 100" },
          { value: "500", label: "KES 500" },
          { value: "1000", label: "KES 1,000" },
        ]}
      />
    );
  },
};
