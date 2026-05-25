export { tokens, tailwindPreset } from "@bm/config";

// ── X7-S02 primitive component library ──────────────────────────────────────
export { cn, type ClassValue } from "./cn.js";
export { FOCUS_RING } from "./styles.js";
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./button.js";
export { Input, type InputProps } from "./input.js";
export { centsToDisplay, displayToCents, formatKes } from "./money.js";
export { MoneyInput, type MoneyInputProps } from "./money-input.js";
export {
  normalizeKePhone,
  formatKePhoneDisplay,
} from "./phone.js";
export { PhoneInput, type PhoneInputProps } from "./phone-input.js";
export { OTPInput, type OTPInputProps } from "./otp-input.js";
export { BottomSheet, type BottomSheetProps } from "./bottom-sheet.js";
export { Toast, type ToastProps, type ToastVariant } from "./toast.js";
export { Spinner, type SpinnerProps, type SpinnerSize } from "./spinner.js";
export { Skeleton, type SkeletonProps } from "./skeleton.js";
export {
  ChipGroup,
  type ChipGroupProps,
  type ChipOption,
} from "./chip-group.js";

// Parent dashboard shell nav model (P1-E11-S05) — pure, framework-free.
export {
  PARENT_NAV_ITEMS,
  activeNavHref,
  isNavItemActive,
  type ParentNavItem,
  type ParentNavKey,
} from "./parent-shell.js";

// Reception receipt template (P1-E05-S06) — browser-printable HTML + SMS copy.
export {
  renderReceiptHtml,
  receiptSmsBody,
  formatReceiptCents,
  RECEIPT_BUSINESS_NAME,
} from "./receipt-preview.js";

// ── X7-S03 compound components for P1 surfaces ──────────────────────────────
export {
  WalletBalanceCard,
  type WalletBalanceCardProps,
} from "./wallet-balance-card.js";
export {
  ChildCard,
  formatChildAge,
  type ChildCardProps,
} from "./child-card.js";
export {
  MpesaPushPrompt,
  type MpesaPushPromptProps,
} from "./mpesa-push-prompt.js";
export {
  ReceiptPreview,
  type ReceiptPreviewProps,
} from "./receipt-preview-card.js";
export {
  ParentShellLayout,
  type ParentShellLayoutProps,
  type LinkRenderProps,
} from "./parent-shell-layout.js";
export {
  StaffShellLayout,
  isStaffNavActive,
  type StaffShellLayoutProps,
  type StaffNavItem,
} from "./staff-shell-layout.js";

// Full KRA-shaped receipt render (P1-E08-S03) — A4 HTML + 80mm thermal.
export {
  toReceiptDocument,
  renderReceipt,
  renderReceiptA4,
  renderReceiptThermal,
  receiptContentType,
  maskPhoneLast4,
  // formatReceiptCents already re-exported from receipt-preview (same impl).
  DEFAULT_BUSINESS_DETAILS,
  type ReceiptDocument,
  type ReceiptDocumentLine,
  type ReceiptRecordInput,
  type ReceiptRenderContext,
  type ReceiptBusinessDetails,
  type ReceiptFormat,
} from "./receipt-document.js";
