/**
 * Dependency-free helpers for validating the project's GitHub Actions
 * workflow files (X8-S04). The repo deliberately avoids adding a runtime
 * YAML dependency (CI installs with `--frozen-lockfile`), so this module
 * ships a small indentation-based parser that covers the subset of YAML the
 * workflows use: nested maps, block sequences, inline `{ }` flow maps and
 * `[ ]` flow sequences, scalars, and `#` comments.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
export type YamlMap = { [key: string]: YamlValue };

/** The five deployable apps in the monorepo. */
export const APPS = ["api", "platform", "pos", "admin", "jobs"] as const;
export type AppName = (typeof APPS)[number];

interface Line {
  indent: number;
  content: string;
}

function tokenizeLines(source: string): Line[] {
  const out: Line[] = [];
  for (const raw of source.split("\n")) {
    // Strip full-line comments and trailing comments that are not inside quotes.
    const stripped = stripComment(raw);
    if (stripped.trim() === "") continue;
    const indent = stripped.length - stripped.trimStart().length;
    out.push({ indent, content: stripped.trim() });
  }
  return out;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      // A comment must be preceded by whitespace or be at line start.
      if (i === 0 || line[i - 1] === " " || line[i - 1] === "\t") {
        return line.slice(0, i).replace(/\s+$/u, "");
      }
    }
  }
  return line;
}

function parseScalar(token: string): YamlValue {
  const t = token.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/u.test(t)) return Number(t);
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  if (t.startsWith("{") && t.endsWith("}")) return parseFlowMap(t);
  if (t.startsWith("[") && t.endsWith("]")) return parseFlowSeq(t);
  return t;
}

function splitFlow(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let current = "";
  for (const ch of body) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

function parseFlowMap(token: string): YamlMap {
  const body = token.slice(1, -1).trim();
  const map: YamlMap = {};
  if (body === "") return map;
  for (const part of splitFlow(body)) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    map[key] = parseScalar(part.slice(idx + 1).trim());
  }
  return map;
}

function parseFlowSeq(token: string): YamlValue[] {
  const body = token.slice(1, -1).trim();
  if (body === "") return [];
  return splitFlow(body).map((p) => parseScalar(p.trim()));
}

interface ParseState {
  lines: Line[];
  pos: number;
}

function parseBlock(state: ParseState): YamlValue {
  const first = state.lines[state.pos];
  if (first === undefined) return null;

  if (first.content.startsWith("- ") || first.content === "-") {
    return parseSequence(state, first.indent);
  }
  // Anchor the mapping on the actual indent of its first line, not on a guessed
  // parent+1 (block indentation is arbitrary in YAML).
  return parseMapping(state, first.indent);
}

function parseSequence(state: ParseState, indent: number): YamlValue[] {
  const seq: YamlValue[] = [];
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos];
    if (line === undefined || line.indent !== indent || !line.content.startsWith("-")) break;
    const rest = line.content === "-" ? "" : line.content.slice(1).trimStart();
    if (rest === "") {
      state.pos++;
      seq.push(parseBlock(state));
    } else if (rest.includes(":") && !rest.startsWith("{") && !rest.startsWith("[")) {
      // Inline map item: rewrite so the first key sits at indent+2 and reparse.
      const itemIndent = indent + (line.content.length - rest.length);
      state.lines[state.pos] = { indent: itemIndent, content: rest };
      seq.push(parseMapping(state, itemIndent));
    } else {
      state.pos++;
      seq.push(parseScalar(rest));
    }
  }
  return seq;
}

function parseMapping(state: ParseState, indent: number): YamlMap {
  const map: YamlMap = {};
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos];
    if (line === undefined || line.indent < indent) break;
    if (line.indent > indent) break;
    if (line.content.startsWith("-")) break;

    const idx = findKeyColon(line.content);
    if (idx === -1) {
      state.pos++;
      continue;
    }
    const key = unquoteKey(line.content.slice(0, idx).trim());
    const value = line.content.slice(idx + 1).trim();
    state.pos++;
    if (value === "" || value === "|" || value === ">") {
      const next = state.lines[state.pos];
      if (value === "|" || value === ">") {
        map[key] = collectBlockScalar(state, indent);
      } else if (next !== undefined && next.indent > indent) {
        map[key] = parseBlock(state);
      } else if (next !== undefined && next.indent === indent && next.content.startsWith("-")) {
        map[key] = parseSequence(state, indent);
      } else {
        map[key] = null;
      }
    } else {
      map[key] = parseScalar(value);
    }
  }
  return map;
}

function collectBlockScalar(state: ParseState, parentIndent: number): string {
  const collected: string[] = [];
  while (state.pos < state.lines.length) {
    const line = state.lines[state.pos];
    if (line === undefined || line.indent <= parentIndent) break;
    collected.push(line.content);
    state.pos++;
  }
  return collected.join("\n");
}

function findKeyColon(content: string): number {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      else if (ch === ":" && depth === 0 && (i + 1 >= content.length || content[i + 1] === " ")) {
        return i;
      }
    }
  }
  return -1;
}

function unquoteKey(key: string): string {
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    return key.slice(1, -1);
  }
  return key;
}

/** Parse a YAML-subset document (sufficient for our workflow files). */
export function parseYaml(source: string): YamlMap {
  const state: ParseState = { lines: tokenizeLines(source), pos: 0 };
  if (state.lines.length === 0) return {};
  const result = parseBlock(state);
  return (typeof result === "object" && result !== null && !Array.isArray(result) ? result : {}) as YamlMap;
}

// ---------------------------------------------------------------------------
// Workflow assertions
// ---------------------------------------------------------------------------

export interface WorkflowJob {
  name: string;
  raw: YamlMap;
  steps: YamlMap[];
}

export interface ParsedWorkflow {
  name: string;
  on: YamlValue;
  jobs: Record<string, WorkflowJob>;
  raw: YamlMap;
}

export function parseWorkflow(source: string): ParsedWorkflow {
  const doc = parseYaml(source);
  const jobsRaw = (doc.jobs ?? {}) as YamlMap;
  const jobs: Record<string, WorkflowJob> = {};
  for (const [name, value] of Object.entries(jobsRaw)) {
    const job = (value ?? {}) as YamlMap;
    const stepsValue = job.steps;
    const steps = Array.isArray(stepsValue)
      ? (stepsValue.filter((s) => typeof s === "object" && s !== null && !Array.isArray(s)) as YamlMap[])
      : [];
    jobs[name] = { name, raw: job, steps };
  }
  return {
    name: typeof doc.name === "string" ? doc.name : "",
    on: doc.on ?? null,
    jobs,
    raw: doc,
  };
}

/** Look up a job by name, throwing a clear error if it is absent. */
export function requireJob(wf: ParsedWorkflow, name: string): WorkflowJob {
  const job = wf.jobs[name];
  if (job === undefined) {
    throw new Error(`workflow "${wf.name}" is missing job "${name}"`);
  }
  return job;
}

/** Concatenate every `run:` script across a job's steps. */
export function jobRunScript(job: WorkflowJob): string {
  return job.steps
    .map((s) => (typeof s.run === "string" ? s.run : ""))
    .filter(Boolean)
    .join("\n");
}

/** True when any step in the job runs a command containing `needle`. */
export function jobRuns(job: WorkflowJob, needle: string): boolean {
  return jobRunScript(job).includes(needle);
}
