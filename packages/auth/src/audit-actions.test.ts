import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_CATALOGUE,
  auditAction,
  isAuditAction,
  type AuditAction,
} from "./audit-actions.js";

describe("audit catalogue — shape & categories (AC1, AC2)", () => {
  it("is a non-empty set of unique dotted action names", () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0);
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
    }
  });

  it("covers every required AC2 category with at least one action", () => {
    const required = ["auth", "roleChange", "ledger", "refund", "settings"] as const;
    for (const category of required) {
      expect(AUDIT_ACTION_CATALOGUE[category].length).toBeGreaterThan(0);
    }
  });

  it("includes representative actions for each AC2 category", () => {
    const set = new Set<string>(AUDIT_ACTIONS);
    // all auth events
    for (const a of [
      "auth.signup",
      "auth.login.success",
      "auth.login.failure",
      "auth.logout",
      "parent.pin.change",
      "auth.reset.requested",
      "auth.reset.completed",
    ]) {
      expect(set.has(a)).toBe(true);
    }
    // all role changes
    for (const a of ["admin.user.create", "admin.user.update", "rbac.impersonate"]) {
      expect(set.has(a)).toBe(true);
    }
    // ledger postings
    for (const a of ["wallet.checkin_debit", "payment.cash.topup"]) {
      expect(set.has(a)).toBe(true);
    }
    // refunds
    expect(set.has("wallet.refund")).toBe(true);
    // settings changes
    for (const a of ["settings.update", "sms.config.update"]) {
      expect(set.has(a)).toBe(true);
    }
  });
});

describe("audit catalogue — exclusions (AC3): reads, list-views, navigation NOT audited", () => {
  it("contains no read / list / view / navigation actions", () => {
    const forbidden = /(^|\.)(read|list|view|page|nav|navigate|browse|fetch|get)(\.|$)/;
    for (const action of AUDIT_ACTIONS) {
      expect(action.match(forbidden), `unexpected read/list/view action: ${action}`).toBeNull();
    }
  });
});

describe("audit catalogue — type narrowing (AC1)", () => {
  it("auditAction() accepts a valid literal and returns it unchanged", () => {
    const a = auditAction("auth.signup");
    expect(a).toBe("auth.signup");
    // Compile-time check: the returned type is the narrowed literal / AuditAction.
    const narrowed: AuditAction = a;
    expect(typeof narrowed).toBe("string");
  });

  it("isAuditAction() narrows known actions and rejects unknown ones", () => {
    expect(isAuditAction("wallet.refund")).toBe(true);
    expect(isAuditAction("wallet.read")).toBe(false);
    expect(isAuditAction("not.a.real.action")).toBe(false);
  });
});

/**
 * Single-source-of-truth completeness test: scan every `audit(...)` call site
 * across `apps/` and `packages/` and assert each emitted `action:` literal is
 * registered in the catalogue. Guards against drift where a new audited action
 * is wired up but never added here.
 */
describe("audit catalogue — single source of truth across the codebase", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  function walk(dir: string, out: string[]): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "dist" || name === ".turbo" || name === ".next") {
        continue;
      }
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, out);
      } else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  }

  function emittedActions(): Map<string, string> {
    const files: string[] = [];
    walk(join(repoRoot, "apps"), files);
    walk(join(repoRoot, "packages"), files);

    const found = new Map<string, string>();
    // Match an `action: "..."` that appears inside an `audit( ... )` call. We
    // scan each `audit(` occurrence and read the first action literal after it.
    for (const file of files) {
      // Skip the helper + catalogue definitions themselves.
      if (file.endsWith(join("db", "src", "audit.ts"))) continue;
      if (file.endsWith(join("auth", "src", "audit-actions.ts"))) continue;

      const src = readFileSync(file, "utf8");
      let idx = src.indexOf("audit(");
      while (idx !== -1) {
        // Look at the slice from this call to the next semicolon-ish boundary.
        const slice = src.slice(idx, idx + 600);
        const m = slice.match(/action:\s*(?:auditAction\(\s*)?"([^"]+)"/);
        // Ignore ternary/ dynamic action expressions we can't statically read.
        if (m) {
          found.set(m[1]!, file);
        } else {
          // Handle the ternary logout case: capture all string literals on the
          // action line.
          const line = slice.match(/action:\s*([^,\n]+)/);
          if (line) {
            const literals = line[1]!.match(/"([^"]+)"/g) ?? [];
            for (const lit of literals) {
              found.set(lit.replaceAll('"', ""), file);
            }
          }
        }
        idx = src.indexOf("audit(", idx + 1);
      }
    }
    return found;
  }

  it("every emitted audit action is registered in the catalogue", () => {
    const emitted = emittedActions();
    expect(emitted.size).toBeGreaterThan(10); // sanity: we actually found call sites

    const unregistered: string[] = [];
    for (const [action, file] of emitted) {
      // Test fixtures emit synthetic actions (e.g. "a.one"); ignore anything
      // that is not dotted-real by checking against the catalogue only for
      // production source files (tests already excluded by walk()).
      if (!isAuditAction(action)) {
        unregistered.push(`${action}  (${file.replace(repoRoot, "")})`);
      }
    }

    expect(unregistered, `actions emitted but missing from the catalogue:\n${unregistered.join("\n")}`).toEqual(
      [],
    );
  });
});
