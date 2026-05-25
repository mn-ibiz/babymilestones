import { bankInstructionLines, BANK_TRANSFER_INSTRUCTIONS } from "../../lib/topup-flow";

/**
 * Bank-transfer instructions screen for the parent dashboard top-up flow
 * (P1-E11-S03 AC3). Unlike the M-Pesa/card rails there is no in-app charge to
 * initiate: the parent transfers out-of-band to the account shown here and an
 * admin confirms it (P1-E04-S07), which credits the wallet. This is therefore a
 * static, dependency-free instructions screen driven by the tested
 * `bankInstructionLines()` pure function.
 */
export function BankTransferInstructions() {
  const lines = bankInstructionLines();
  return (
    <div aria-label="Bank transfer instructions">
      <ol>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <dl>
        <dt>Account name</dt>
        <dd>{BANK_TRANSFER_INSTRUCTIONS.accountName}</dd>
        <dt>Bank</dt>
        <dd>{BANK_TRANSFER_INSTRUCTIONS.bankName}</dd>
        <dt>Account number</dt>
        <dd>{BANK_TRANSFER_INSTRUCTIONS.accountNumber}</dd>
        <dt>Branch</dt>
        <dd>{BANK_TRANSFER_INSTRUCTIONS.branch}</dd>
      </dl>
    </div>
  );
}
