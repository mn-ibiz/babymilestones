import { and, desc, eq } from "drizzle-orm";
import { smsTemplates, type Database, type SmsTemplateRow, type Transaction } from "@bm/db";
import type { SmsTemplateData } from "./templates.js";

/** A drizzle executor — the top-level db or a transaction handle. */
export type TemplateExecutor = Database | Transaction;

/** Default language for template resolution when a caller does not specify one. */
export const DEFAULT_TEMPLATE_LANGUAGE = "en" as const;

/** Public (DB-agnostic) shape of a registered template row (AC3 admin view). */
export interface PublicSmsTemplate {
  id: string;
  key: string;
  language: string;
  version: number;
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a row to its public shape — the single seam every read goes through. */
export function toPublicSmsTemplate(row: SmsTemplateRow): PublicSmsTemplate {
  return {
    id: row.id,
    key: row.key,
    language: row.language,
    version: row.version,
    body: row.body,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Interpolate `{placeholder}` tokens in a template body from the data bag.
 * A token whose key is absent from `data` (or whose value is null/undefined)
 * throws — a missing placeholder is a copy/data mismatch, not a silent blank.
 * Stringifies primitive values; objects/arrays are JSON-rejected to avoid
 * leaking `[object Object]` into a message.
 */
export function interpolateTemplate(body: string, data: SmsTemplateData): string {
  // String.replace with a function callback — no RegExp.exec (hook-safety).
  return body.replace(/\{([A-Za-z0-9_.]+)\}/g, (_match, token: string) => {
    const value = data[token];
    if (value === undefined || value === null) {
      throw new Error(`sms template: missing required placeholder "${token}"`);
    }
    if (typeof value === "object") {
      throw new Error(`sms template: placeholder "${token}" must be a scalar`);
    }
    return String(value);
  });
}

/**
 * Fetch the single ACTIVE template for `key` (+ language), or null when none is
 * registered/active. Active is unique per (key, language) by index; the
 * `desc(version)` order is belt-and-braces.
 */
export async function getActiveTemplate(
  db: TemplateExecutor,
  key: string,
  language: string = DEFAULT_TEMPLATE_LANGUAGE,
): Promise<SmsTemplateRow | null> {
  const [row] = await db
    .select()
    .from(smsTemplates)
    .where(
      and(
        eq(smsTemplates.key, key),
        eq(smsTemplates.language, language),
        eq(smsTemplates.isActive, true),
      ),
    )
    .orderBy(desc(smsTemplates.version))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a registered template by key and render it against `data` (AC2). The
 * adapter calls this at send time so the copy lives in `sms_templates`, not in
 * inline strings. An unknown / inactive key throws clearly (AC: unknown key
 * handled), as does a missing placeholder.
 */
export async function resolveTemplate(
  db: TemplateExecutor,
  key: string,
  data: SmsTemplateData,
  language: string = DEFAULT_TEMPLATE_LANGUAGE,
): Promise<string> {
  const row = await getActiveTemplate(db, key, language);
  if (!row) {
    throw new Error(`sms template: no active template registered for key "${key}" (${language})`);
  }
  return interpolateTemplate(row.body, data);
}

/** List all template versions for a key (+ language), newest version first. */
export async function listTemplateVersions(
  db: TemplateExecutor,
  key: string,
  language: string = DEFAULT_TEMPLATE_LANGUAGE,
): Promise<SmsTemplateRow[]> {
  return db
    .select()
    .from(smsTemplates)
    .where(and(eq(smsTemplates.key, key), eq(smsTemplates.language, language)))
    .orderBy(desc(smsTemplates.version));
}

/** List the active template per key (the admin read-only view, AC3), key-sorted. */
export async function listActiveTemplates(db: TemplateExecutor): Promise<SmsTemplateRow[]> {
  const rows = await db
    .select()
    .from(smsTemplates)
    .where(eq(smsTemplates.isActive, true));
  return rows.sort((a, b) => a.key.localeCompare(b.key) || a.language.localeCompare(b.language));
}
