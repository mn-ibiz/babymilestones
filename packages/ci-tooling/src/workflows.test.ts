import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPS,
  jobRunScript,
  jobRuns,
  parseWorkflow,
  parseYaml,
  requireJob,
  type ParsedWorkflow,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
// packages/ci-tooling/src -> repo root
const repoRoot = join(here, "..", "..", "..");
const workflowsDir = join(repoRoot, ".github", "workflows");

function loadWorkflow(file: string): { source: string; wf: ParsedWorkflow } {
  const source = readFileSync(join(workflowsDir, file), "utf8");
  return { source, wf: parseWorkflow(source) };
}

describe("parseYaml (subset parser)", () => {
  it("parses nested maps, sequences and inline flow maps", () => {
    const doc = parseYaml(
      [
        "name: Demo",
        "on:",
        "  pull_request:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    strategy:",
        "      matrix:",
        "        app: [api, platform]",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - run: pnpm build",
        "        with: { filter: true }",
      ].join("\n"),
    );
    expect(doc.name).toBe("Demo");
    const jobs = doc.jobs as Record<string, Record<string, unknown>>;
    const build = jobs.build as Record<string, unknown>;
    const matrix = (build.strategy as Record<string, Record<string, unknown>>).matrix as Record<
      string,
      unknown
    >;
    expect(matrix.app).toEqual(["api", "platform"]);
    const steps = build.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);
    expect(steps[0]?.uses).toBe("actions/checkout@v4");
    expect(steps[1]?.run).toBe("pnpm build");
    expect(steps[1]?.with).toEqual({ filter: true });
  });

  it("ignores comments outside of quotes", () => {
    const doc = parseYaml(["# header", "name: keep # trailing", 'note: "a # b"'].join("\n"));
    expect(doc.name).toBe("keep");
    expect(doc.note).toBe("a # b");
  });
});

describe("CI workflow (ci.yml) — PR pipeline (AC #1)", () => {
  const { wf } = loadWorkflow("ci.yml");

  it("triggers on pull_request and on push to main", () => {
    const on = wf.on as Record<string, unknown>;
    expect(on).toHaveProperty("pull_request");
    expect(on).toHaveProperty("push");
  });

  it("runs lint, typecheck and tests across the workspace", () => {
    const script = Object.values(wf.jobs)
      .map((j) => jobRunScript(j))
      .join("\n");
    expect(script).toContain("pnpm lint");
    expect(script).toContain("pnpm typecheck");
    expect(script).toContain("pnpm test");
  });

  it("has a per-app build matrix covering every app", () => {
    const buildJob = requireJob(wf, "build");
    const matrix = (buildJob.raw.strategy as Record<string, Record<string, unknown>> | undefined)
      ?.matrix;
    expect(matrix).toBeDefined();
    const apps = (matrix as Record<string, unknown>).app as string[];
    for (const app of APPS) {
      expect(apps).toContain(app);
    }
  });

  it("builds the matrixed app via turbo --filter", () => {
    const buildJob = requireJob(wf, "build");
    expect(jobRunScript(buildJob)).toContain("--filter");
    expect(jobRunScript(buildJob)).toContain("${{ matrix.app }}");
  });
});

describe("deploy workflow (deploy.yml) — gated migrations (AC #2)", () => {
  const { wf } = loadWorkflow("deploy.yml");

  it("only runs on push to main", () => {
    const on = wf.on as Record<string, Record<string, unknown> | undefined>;
    expect(on).toHaveProperty("push");
    expect(on.push?.branches).toEqual(["main"]);
    expect(on).not.toHaveProperty("pull_request");
  });

  it("has a migrate job that applies db migrations", () => {
    const migrate = requireJob(wf, "migrate");
    expect(jobRuns(migrate, "migrate")).toBe(true);
  });

  it("gates every per-app deploy job behind the migrate job (fail-closed)", () => {
    const deployJobs = Object.values(wf.jobs).filter((j) => j.name.startsWith("deploy"));
    expect(deployJobs.length).toBeGreaterThan(0);
    for (const job of deployJobs) {
      const needs = job.raw.needs;
      const needsList = Array.isArray(needs) ? needs : [needs];
      expect(needsList).toContain("migrate");
    }
  });

  it("covers a deploy path for every app", () => {
    const matrix = (wf.jobs.deploy?.raw.strategy as Record<string, Record<string, unknown>> | undefined)
      ?.matrix;
    expect(matrix).toBeDefined();
    const apps = (matrix as Record<string, unknown>).app as string[];
    for (const app of APPS) {
      expect(apps).toContain(app);
    }
  });
});

describe("preview workflow (preview.yml) — per-PR environments (AC #3)", () => {
  const { wf } = loadWorkflow("preview.yml");

  it("reacts to pull_request open/sync and close", () => {
    const on = wf.on as Record<string, Record<string, unknown> | undefined>;
    expect(on).toHaveProperty("pull_request");
    const types = on.pull_request?.types as string[];
    expect(types).toContain("opened");
    expect(types).toContain("closed");
  });

  it("has a job to deploy a preview and a job to tear it down", () => {
    expect(wf.jobs.preview).toBeDefined();
    const teardown = wf.jobs.teardown;
    expect(teardown).toBeDefined();
    // Teardown only runs when the PR is closed.
    expect(String(teardown?.raw.if ?? "")).toContain("closed");
  });

  it("scopes preview environments per PR (namespaced pr-<number>)", () => {
    // The PR-number namespace is passed via step `env:` (the safe pattern —
    // untrusted-ish context goes through an env var, not interpolated into a
    // shell command). Collect every step env value and assert the namespace.
    const envValues: string[] = [];
    for (const job of Object.values(wf.jobs)) {
      for (const step of job.steps) {
        const env = step.env;
        if (env && typeof env === "object" && !Array.isArray(env)) {
          for (const v of Object.values(env)) {
            if (typeof v === "string") envValues.push(v);
          }
        }
      }
    }
    expect(envValues).toContain("pr-${{ github.event.pull_request.number }}");
  });
});

describe("rollback runbook (AC #4)", () => {
  it("documents a one-click rollback procedure", () => {
    const runbook = readFileSync(join(repoRoot, "infra", "rollback-runbook.md"), "utf8");
    expect(runbook.toLowerCase()).toContain("rollback");
    expect(runbook.toLowerCase()).toContain("one-click");
    // References the deploy workflow it rolls back.
    expect(runbook).toContain("deploy.yml");
  });
});
