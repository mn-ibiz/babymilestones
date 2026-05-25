/**
 * Admin SMS templates read-only view logic (P1-E09-S03, AC3). Framework-agnostic
 * + dependency-light so it unit-tests without a DOM. Editing is deferred to P2;
 * P1 only shapes the registered, versioned copy for display. The API
 * (`/admin/sms-templates`) is the source of truth.
 */
import type { SmsTemplatePublic } from "@bm/contracts";

/** Roles allowed to view SMS templates (mirrors `manage config`). Server re-checks. */
const MANAGE_CONFIG_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may view the SMS templates surface (AC3). */
export function canViewSmsTemplates(role: string): boolean {
  return MANAGE_CONFIG_ROLES.has(role);
}

/** Stable sort for display: by key, then language. */
export function sortTemplatesForDisplay(templates: SmsTemplatePublic[]): SmsTemplatePublic[] {
  return [...templates].sort(
    (a, b) => a.key.localeCompare(b.key) || a.language.localeCompare(b.language),
  );
}

/** Human label for a template version + active state. */
export function templateVersionLabel(t: Pick<SmsTemplatePublic, "version" | "isActive">): string {
  return t.isActive ? `v${t.version} (active)` : `v${t.version}`;
}

/** Extract the `{placeholder}` tokens a body declares, in first-seen order. */
export function placeholdersOf(body: string): string[] {
  const seen: string[] = [];
  for (const token of body.match(/\{[A-Za-z0-9_.]+\}/g) ?? []) {
    const name = token.slice(1, -1);
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}
