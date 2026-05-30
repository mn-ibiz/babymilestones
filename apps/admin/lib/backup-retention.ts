import {
  backupRetentionPolicySchema,
  type BackupRetentionPolicy,
} from "@bm/contracts";

/**
 * Pure view helpers for the backup-retention settings screen. Kept React-free
 * so the form-validation and summary logic are unit-tested directly. Form fields
 * arrive as strings from inputs; we parse and validate them against the shared
 * contract so the UI rejects exactly what the API would.
 */
export interface RetentionFormInput {
  dailyKeep: string;
  monthlyKeep: string;
  graceDays: string;
}

export type RetentionFormErrors = Partial<
  Record<keyof RetentionFormInput, string>
>;

export type ParseRetentionResult =
  | { ok: true; policy: BackupRetentionPolicy }
  | { ok: false; errors: RetentionFormErrors };

const FIELD_MESSAGES: Record<keyof RetentionFormInput, string> = {
  dailyKeep: "Daily backups to keep must be a whole number of at least 1.",
  monthlyKeep: "Monthly backups to keep must be a whole number of 0 or more.",
  graceDays: "Grace period must be a whole number of days, 0 or more.",
};

export function parseRetentionForm(
  input: RetentionFormInput,
): ParseRetentionResult {
  const candidate = {
    dailyKeep: toNumber(input.dailyKeep),
    monthlyKeep: toNumber(input.monthlyKeep),
    graceDays: toNumber(input.graceDays),
  };
  const parsed = backupRetentionPolicySchema.safeParse(candidate);
  if (parsed.success) return { ok: true, policy: parsed.data };
  const errors: RetentionFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof RetentionFormInput | undefined;
    if (field && !errors[field]) errors[field] = FIELD_MESSAGES[field];
  }
  return { ok: false, errors };
}

/** Plain-language summary of a policy for display to operators. */
export function describeRetentionPolicy(policy: BackupRetentionPolicy): string {
  const dayWord = policy.graceDays === 1 ? "day" : "days";
  return (
    `Keep the ${policy.dailyKeep} most recent daily backups and ` +
    `${policy.monthlyKeep} monthly backups; never prune anything from ` +
    `the last ${policy.graceDays} ${dayWord}.`
  );
}

// Empty / non-numeric input becomes NaN so the integer schema rejects it.
function toNumber(value: string): number {
  if (value.trim() === "") return Number.NaN;
  return Number(value);
}
