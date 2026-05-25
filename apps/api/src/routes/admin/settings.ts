import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, settings, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import {
  SETTING_DEFAULTS,
  isSettingKey,
  parseSettingValue,
  type SettingKey,
} from "@bm/contracts";
import type { SessionStore } from "@bm/auth";

export interface AdminSettingsDeps {
  db: Database;
  sessions: SessionStore;
}

/** Resolve a session userId to its live id+role (for the permission guard). */
function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** A section surfaced by the Settings index (AC1). */
interface SettingsSection {
  key: string;
  label: string;
  /** Where the admin manages this section. */
  href: string;
  /** Whether this surface has a dedicated table (links out) or is a general key/value section. */
  kind: "general" | "linked";
  /** False when the current principal lacks the extra role this section needs (e.g. treasury). */
  accessible: boolean;
}

/**
 * Settings sub-app API (P1-E10-S04). Aggregates the system-wide configuration an
 * admin manages from one place:
 *
 *   GET /admin/settings           — the section index (AC1), each section tagged
 *                                   with whether the caller can access it (AC2).
 *   GET /admin/settings/:key      — read one GENERAL section (key/value), or the
 *                                   typed default when unset.
 *   PUT /admin/settings/:key      — upsert one general section; payload validated
 *                                   with `@bm/contracts`, write audited (AC3).
 *
 * The general sections (loyalty, branding, receipt_branding) live in the generic
 * `settings` key/value table. SMS provider config and float accounts keep their
 * own dedicated CRUD surfaces — the index links to them.
 *
 * Base access is `manage config` (admin / super_admin). The float-accounts
 * sub-section additionally requires `manage float` (treasury / super_admin)
 * (AC2). Every general-section write is audited to `audit_outbox` (AC3).
 */
export function registerAdminSettings(app: FastifyInstance, deps: AdminSettingsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

  /** Authenticate + enforce base `manage config`. Returns the principal or sends an error. */
  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, "manage", "config")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  /** Float-account sub-section needs the treasury grant in addition to config (AC2). */
  function canManageFloatSection(role: string): boolean {
    return can(role, "manage", "float");
  }

  function buildSections(role: string): SettingsSection[] {
    return [
      {
        key: "sms_config",
        label: "SMS provider",
        href: "/sms-config",
        kind: "linked",
        accessible: true,
      },
      {
        key: "float_accounts",
        label: "Float accounts",
        href: "/treasury/float-accounts",
        kind: "linked",
        accessible: canManageFloatSection(role),
      },
      {
        key: "loyalty",
        label: "Loyalty rates",
        href: "/settings/loyalty",
        kind: "general",
        accessible: true,
      },
      {
        key: "branding",
        label: "Branding",
        href: "/settings/branding",
        kind: "general",
        accessible: true,
      },
      {
        key: "receipt_branding",
        label: "Receipt branding",
        href: "/settings/receipt-branding",
        kind: "general",
        accessible: true,
      },
    ];
  }

  // AC1: the section index.
  app.get("/admin/settings", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    return reply.code(200).send({ sections: buildSections(actor.role) });
  });

  // AC1: read one general section (typed default when unset).
  app.get("/admin/settings/:key", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { key } = req.params as { key: string };
    if (!isSettingKey(key)) return reply.code(404).send({ error: "Unknown settings section" });

    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    const value = row?.value ?? SETTING_DEFAULTS[key];
    return reply.code(200).send({
      key,
      value,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    });
  });

  // AC1/AC3: upsert one general section.
  app.put("/admin/settings/:key", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const { key } = req.params as { key: string };
    if (!isSettingKey(key)) return reply.code(404).send({ error: "Unknown settings section" });

    const parsed = parseSettingValue(key as SettingKey, req.body);
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.error, field: parsed.field });
    }

    const now = new Date();
    const [row] = await db
      .insert(settings)
      .values({ key, value: parsed.value, updatedBy: actor.id, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: parsed.value, updatedBy: actor.id, updatedAt: now },
      })
      .returning();

    await audit(db, {
      actor: actor.id,
      action: "settings.update",
      target: { table: "settings", id: key },
      payload: { key, value: parsed.value, ip: req.ip },
    });

    return reply.code(200).send({
      key,
      value: row!.value,
      updatedAt: row!.updatedAt.toISOString(),
    });
  });
}
