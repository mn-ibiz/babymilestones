import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import { wooConfigSaveSchema } from "@bm/contracts";
import {
  saveWooConfig,
  getWooConfigPublic,
  resolveWooClientConfig,
  createWooClient,
  type WooTransport,
} from "@bm/woocommerce";
import type { SessionStore } from "@bm/auth";

/**
 * WooCommerce credentials-config wiring for the admin Settings panel (Story
 * 29.6 / P4-E04-S06). The encryption key encrypts the consumer key/secret at
 * rest; the transport is injected so test-connection never touches a real Woo
 * server in tests (production passes `globalThis.fetch`).
 */
export interface WooCommerceRouteConfig {
  /** Master key material used to encrypt the credentials at rest (AC3). */
  encryptionKey: string;
  /** HTTP transport for the test-connection probe (AC4). */
  transport: WooTransport;
}

export interface AdminWooCommerceConfigDeps {
  db: Database;
  sessions: SessionStore;
  /** WooCommerce wiring; when absent the routes are not registered. */
  woocommerce?: WooCommerceRouteConfig;
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

/**
 * Admin WooCommerce credentials config (Story 29.6, AC3/AC4). All routes are
 * reserved to roles holding `manage config` (admin / super_admin).
 *
 *   GET  /admin/woocommerce-config                  — read (secret-free; AC3)
 *   PUT  /admin/woocommerce-config                  — save (encrypts secrets; AC3)
 *   POST /admin/woocommerce-config/test-connection  — probe system_status (AC4)
 *
 * Secrets are accepted on save only, encrypted at rest, and NEVER returned to
 * the client (write-only). Save + test-connection are audited (AUDIT RULE).
 * When the WooCommerce wiring is absent (no encryption key / transport) the
 * routes are not registered.
 */
export function registerAdminWooCommerceConfig(
  app: FastifyInstance,
  deps: AdminWooCommerceConfigDeps,
): void {
  const { db, sessions, woocommerce } = deps;
  if (!woocommerce) return;
  const { encryptionKey, transport } = woocommerce;
  const resolveUser = makeResolveUser(db);

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

  // Read — secret-free projection (AC3).
  app.get("/admin/woocommerce-config", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const pub = await getWooConfigPublic(db);
    return reply.code(200).send(pub);
  });

  // Save — encrypts the secrets at rest; never echoes them (AC3).
  app.put("/admin/woocommerce-config", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const parsed = wooConfigSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    await saveWooConfig(db, { input: parsed.data, encryptionKey });

    // Audit the change — site URL + which credentials were (re)set ONLY; the
    // secret values never enter the audit payload (AUDIT RULE).
    await audit(db, {
      actor: actor.id,
      action: "woocommerce.config.update",
      target: { table: "woo_config", id: null },
      payload: {
        site_url: parsed.data.siteUrl,
        consumer_key_set: parsed.data.consumerKey !== undefined,
        consumer_secret_set: parsed.data.consumerSecret !== undefined,
        ip: req.ip,
      },
    });

    const pub = await getWooConfigPublic(db);
    return reply.code(200).send(pub);
  });

  // Test connection — GET /system_status; OK / failure with status + first error (AC4).
  app.post(
    "/admin/woocommerce-config/test-connection",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;

      const clientConfig = await resolveWooClientConfig(db, encryptionKey);
      if (!clientConfig) {
        return reply
          .code(409)
          .send({ error: "WooCommerce credentials are not fully configured" });
      }

      const client = createWooClient({
        config: clientConfig,
        transport,
        // Route the client's structured request log into Fastify's logger,
        // which already redacts secrets; the client never logs the auth header.
        log: (entry) => req.log.info({ woo: entry }, "woocommerce request"),
      });
      const result = await client.testConnection();

      await audit(db, {
        actor: actor.id,
        action: "woocommerce.test_connection",
        target: { table: "woo_config", id: null },
        payload: { ok: result.ok, status: result.status, ip: req.ip },
      });

      return reply.code(200).send(result);
    },
  );
}
