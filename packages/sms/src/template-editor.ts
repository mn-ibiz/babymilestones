import { and, desc, eq } from "drizzle-orm";
import { smsTemplates, type SmsTemplateRow } from "@bm/db";
import type { TemplateExecutor } from "./template-store.js";
import { DEFAULT_TEMPLATE_LANGUAGE } from "./template-store.js";

/**
 * P5-E03-S04 (Epic 33-4) — the WRITE side of the SMS template editor.
 *
 * The read side (`template-store.ts`) lists active templates + version history;
 * this module lets an admin edit a body and SAVE A NEW VERSION (AC3) with
 * placeholder validation (AC2). Templates are versioned per `(key, language)`:
 * a save inserts a new row at `version + 1`, flips it active, and deactivates
 * the prior active row — so every prior version is retained on record.
 *
 * Placeholders are `{token}` tokens (matching `interpolateTemplate` in the
 * store). Validation flags an EMPTY body and any required placeholder that the
 * caller expects but the edited body dropped (AC2: "missing `{name}` flagged").
 */

const PLACEHOLDER_RE = /\{([A-Za-z0-9_.]+)\}/g;
const MAX_BODY_LENGTH = 1600;

/**
 * The outcome of validating an edited template body. `valid` is true only when
 * there are no {@link TemplateValidation.issues}. `placeholders` is every
 * `{token}` found in the body (deduped, first-seen order); `missing` is the
 * subset of `required` placeholders that the body does NOT contain (AC2).
 */
export interface TemplateValidation {
  valid: boolean;
  /** Human-readable problems; empty when {@link valid} is true. */
  issues: string[];
  /** Placeholders present in the body (deduped, first-seen order). */
  placeholders: string[];
  /** Required placeholders that the body is missing (AC2 — flagged). */
  missing: string[];
}

/**
 * Input for {@link saveTemplateVersion}: which template (`key` + optional
 * `language`), the new `body`, and the acting admin (`updatedBy`, recorded as a
 * marker only — `sms_templates` carries no editor column, so it is reserved for
 * the audit row the route writes).
 */
export interface SaveTemplateVersionInput {
  key: string;
  body: string;
  language?: string;
  updatedBy?: string | null;
}

/**
 * Extract the `{token}` placeholders from a template body, deduped and in
 * first-seen order. Mirrors the token grammar of `interpolateTemplate`.
 */
export function extractPlaceholders(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const token = match[1]!;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * Validate an edited template body (AC2). A body is valid when it is non-empty,
 * within the length limit, and contains every `required` placeholder. A required
 * placeholder absent from the body is flagged as missing — e.g. dropping
 * `{name}` from a greeting that needs it.
 */
export function validateTemplateBody(body: string, required: string[] = []): TemplateValidation {
  const issues: string[] = [];
  const placeholders = extractPlaceholders(body);

  if (body.trim().length === 0) {
    issues.push("Template body must not be empty.");
  }
  if (body.length > MAX_BODY_LENGTH) {
    issues.push(`Template body must be at most ${MAX_BODY_LENGTH} characters.`);
  }

  const present = new Set(placeholders);
  const missing = required.filter((token) => !present.has(token));
  for (const token of missing) {
    issues.push(`Missing required placeholder "{${token}}".`);
  }

  return { valid: issues.length === 0, issues, placeholders, missing };
}

/**
 * Save a new version of a template (AC3). Computes the next version for the
 * `(key, language)`, deactivates the current active row, and inserts the new
 * body as the active row at `version + 1`. Prior versions are retained
 * (never updated/deleted). Runs in a transaction so the single-active invariant
 * holds. Returns the newly-active row.
 *
 * Validation is the caller's responsibility (see {@link validateTemplateBody});
 * this writes whatever body it is given.
 */
export async function saveTemplateVersion(
  db: TemplateExecutor,
  input: SaveTemplateVersionInput,
): Promise<SmsTemplateRow> {
  const language = input.language ?? DEFAULT_TEMPLATE_LANGUAGE;
  const { key, body } = input;

  const run = async (tx: TemplateExecutor): Promise<SmsTemplateRow> => {
    const [latest] = await tx
      .select({ version: smsTemplates.version })
      .from(smsTemplates)
      .where(and(eq(smsTemplates.key, key), eq(smsTemplates.language, language)))
      .orderBy(desc(smsTemplates.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    // Deactivate any current active row so the partial unique index holds.
    await tx
      .update(smsTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(smsTemplates.key, key),
          eq(smsTemplates.language, language),
          eq(smsTemplates.isActive, true),
        ),
      );

    const [row] = await tx
      .insert(smsTemplates)
      .values({ key, language, version: nextVersion, body, isActive: true })
      .returning();
    return row!;
  };

  // Prefer a real transaction; fall back to running on the given executor when
  // it is already a transaction handle (no nested-tx support needed in tests).
  if ("transaction" in db && typeof (db as { transaction?: unknown }).transaction === "function") {
    return (db as { transaction: (fn: (tx: TemplateExecutor) => Promise<SmsTemplateRow>) => Promise<SmsTemplateRow> }).transaction(run);
  }
  return run(db);
}
