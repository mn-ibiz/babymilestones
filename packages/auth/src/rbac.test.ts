import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "./session.js";
import { ALL_ROLES } from "./staff.js";
import {
  can,
  canImpersonate,
  requirePermission,
  actAs,
  ImpersonationDeniedError,
  invalidateSessionsOnRoleChange,
  permissionMatrixRows,
  PERMISSION_MATRIX,
} from "./rbac.js";

describe("permission matrix snapshot (P1-E01-S06 — drift gate)", () => {
  // CI fails if the matrix changes without an accompanying migration update.
  it("matches the committed snapshot", () => {
    expect(permissionMatrixRows()).toMatchSnapshot();
  });

  it("covers all eight seeded roles (AC1)", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ALL_ROLES].sort());
  });
});

describe("can() — server-side authorization (AC2)", () => {
  it("parent can read their wallet but cannot manage users", () => {
    expect(can("parent", "read", "wallet")).toBe(true);
    expect(can("parent", "manage", "user")).toBe(false);
    expect(can("parent", "delete", "wallet")).toBe(false);
  });

  it("treasury manages float + reconciliation but cannot manage users", () => {
    expect(can("treasury", "manage", "float")).toBe(true);
    expect(can("treasury", "manage", "reconciliation")).toBe(true);
    expect(can("treasury", "manage", "user")).toBe(false);
  });

  it("admin manages users but is not all-powerful (no role mutation)", () => {
    expect(can("admin", "manage", "user")).toBe(true);
    expect(can("admin", "manage", "role")).toBe(false);
  });

  it("super_admin can do everything via the wildcard", () => {
    expect(can("super_admin", "manage", "role")).toBe(true);
    expect(can("super_admin", "delete", "wallet")).toBe(true);
    expect(can("super_admin", "create", "report")).toBe(true);
  });

  it("unknown role is denied everything", () => {
    expect(can("hacker", "read", "wallet")).toBe(false);
  });
});

describe("requirePermission guard (AC2)", () => {
  it("allows a principal with the permission", () => {
    const guard = requirePermission("manage", "float");
    expect(guard({ id: "u1", role: "treasury" })).toEqual({ ok: true });
  });

  it("rejects a principal without the permission with 403", () => {
    const guard = requirePermission("manage", "user");
    expect(guard({ id: "u1", role: "parent" })).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden: missing permission",
    });
  });
});

describe("actAs impersonation (AC3 — super_admin only, both ids audited)", () => {
  it("only super_admin may impersonate", () => {
    expect(canImpersonate("super_admin")).toBe(true);
    expect(canImpersonate("admin")).toBe(false);
    expect(() => actAs({ id: "a1", role: "admin" }, "victim")).toThrow(
      ImpersonationDeniedError,
    );
  });

  it("records BOTH the real and impersonated user ids in the audit payload", () => {
    const res = actAs({ id: "super-1", role: "super_admin" }, "parent-9");
    expect(res.realUserId).toBe("super-1");
    expect(res.impersonatedUserId).toBe("parent-9");
    expect(res.audit.action).toBe("rbac.impersonate");
    expect(res.audit.actor).toBe("super-1");
    expect(res.audit.target).toEqual({ table: "users", id: "parent-9" });
    expect(res.audit.payload).toEqual({
      real_user_id: "super-1",
      impersonated_user_id: "parent-9",
    });
    // Visible banner signal.
    expect(res.banner).toEqual({ actingAs: "parent-9", by: "super-1" });
  });
});

describe("invalidateSessionsOnRoleChange (AC4)", () => {
  it("destroys all of the user's active sessions", async () => {
    const sessions = new InMemorySessionStore();
    const t1 = await sessions.create("u-role-change");
    const t2 = await sessions.create("u-role-change");
    const other = await sessions.create("u-other");

    await invalidateSessionsOnRoleChange(sessions, "u-role-change");

    expect(await sessions.get(t1)).toBeNull();
    expect(await sessions.get(t2)).toBeNull();
    // Unrelated users keep their sessions.
    expect(await sessions.get(other)).not.toBeNull();
  });
});
