#!/usr/bin/env python3
"""Generate dev-ready BMAD implementation-artifact story files for P2-P5
from the lightweight planning-reference story files.

- Mirrors the format of the existing 72 P1 files in implementation-artifacts/.
- Continues the flat global epic numbering from 16 (P1 used 1-15).
- Appends manifest entries and prints sprint-status YAML blocks.

Re-runnable: skips files that already exist unless --force.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # _bmad-output
STORIES = ROOT / "planning-artifacts" / "stories"
IMPL = ROOT / "implementation-artifacts"
MANIFEST = IMPL / ".story-manifest.json"
TODAY = "2026-05-25"

PHASES = ["p2", "p3", "p4", "p5"]
PHASE_LABEL = {
    "p2": "P2 — Bookings, Subscriptions, POS, Loyalty Redemption",
    "p3": "P3 — Commission, Salon, Loyalty Engine, Reporting",
    "p4": "P4 — WooCommerce Sync + Events Ticketing",
    "p5": "P5 — Coaching, eTIMS, SMS Go-Live, Polish",
}
PHASE_UPPER = {"p2": "P2", "p3": "P3", "p4": "P4", "p5": "P5"}

ID_RE = re.compile(r"^(P\d)-E(\d+)-S(\d+)$|^(X\d)-S(\d+)$")


def slugify(title, cap=60):
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > cap:
        s = s[:cap].rsplit("-", 1)[0]
    return s


def section(body, name):
    """Return text of '## name' section, or '' if absent."""
    m = re.search(rf"^##\s+{re.escape(name)}\s*\n(.*?)(?=^##\s|\Z)",
                  body, re.M | re.S)
    return m.group(1).strip() if m else ""


def parse_meta(body, key):
    m = re.search(rf"^\*\*{re.escape(key)}:\*\*\s*(.+)$", body, re.M)
    return m.group(1).strip() if m else ""


def parse_acs(ac_text):
    """Return list of AC strings (without the AC#/-bullet prefix)."""
    acs = []
    cur = None
    for line in ac_text.splitlines():
        m = re.match(r"^-\s*(?:\*\*)?AC\d+(?:\*\*)?[:.\s]\s*(.*)$", line)
        if m:
            if cur is not None:
                acs.append(cur.strip())
            cur = m.group(1)
        elif re.match(r"^-\s+", line) and cur is None:
            # plain bullet AC (no ACn prefix)
            acs.append(re.sub(r"^-\s+", "", line).strip())
        elif cur is not None:
            # continuation / sub-bullet
            cur += "\n  " + line.strip()
    if cur is not None:
        acs.append(cur.strip())
    return [a for a in acs if a]


def parse_jtbd(jtbd):
    """Split 'As X, I want Y, so that Z.' -> (role, want, benefit)."""
    text = " ".join(jtbd.split())
    m = re.match(r"As (?:an?|a) (.+?),?\s+I want (.+)", text, re.I)
    if not m:
        return None
    role = m.group(1).strip()
    rest = m.group(2).strip()
    benefit = ""
    sm = re.search(r"(.*?),?\s+so (?:that )?(.+)$", rest, re.I)
    if sm:
        want = sm.group(1).strip()
        benefit = sm.group(2).strip().rstrip(".")
    else:
        want = rest.rstrip(".")
    return role, want, benefit


def build_story_block(jtbd):
    parsed = parse_jtbd(jtbd)
    if not parsed:
        return f"{jtbd.strip()}\n"
    role, want, benefit = parsed
    out = f"As {role},\nI want {want},\n"
    if benefit:
        out += f"so that {benefit}.\n"
    else:
        out += "so that the capability described above is delivered.\n"
    return out


def build_tasks(acs, tech, tests, epic_title, title):
    n = len(acs)
    ac_all = ", ".join(f"#{i+1}" for i in range(n)) if n else "all"
    lines = [f"- [ ] Task 1: Implement {title} (AC: {ac_all})"]
    for i, ac in enumerate(acs):
        first = ac.splitlines()[0]
        lines.append(f"  - [ ] Satisfy AC#{i+1}: {first}")
    # surface file/path hints from technical notes
    paths = re.findall(r"`([^`]*(?:/|\.ts|\.tsx|packages|apps)[^`]*)`", tech)
    if paths:
        uniq = ", ".join(dict.fromkeys(f"`{p}`" for p in paths))
        lines.append(f"  - [ ] Touch / create: {uniq}")
    lines.append(f"- [ ] Task 2: Tests (AC: all)")
    if tests:
        for tl in tests.splitlines():
            tl = tl.strip()
            if tl.startswith("-"):
                lines.append(f"  {tl}")
    else:
        lines.append("  - [ ] Test-first with vitest (`pnpm test`); cover each AC "
                     "(unit / integration / e2e as appropriate)")
    return "\n".join(lines)


def build_dev_notes(tech, deps, source_rel, phase_upper, epic_id):
    parts = []
    if tech:
        parts.append(tech)
    parts.append("Testing standards: vitest (`pnpm test`), TS strict, test-first. "
                 "Migrations additive-only. Audited actions write to `audit_outbox`.")
    notes = "\n\n".join(parts)
    struct = []
    if deps:
        struct.append(f"- Dependencies (from source): {deps}")
    struct.append("- Follow the monorepo layout: APIs in `apps/api`, UI surfaces in "
                  "`apps/*`, shared logic in `packages/*`, migrations in `packages/db`.")
    refs = (f"- [Source: {source_rel}]\n"
            f"- [Spec: Baby-Milestones-Spec.md v2.1] and "
            f"[Epics: _bmad-output/planning-artifacts/epics.md] § {phase_upper}-{epic_id}.")
    return notes, "\n".join(struct), refs


def main():
    force = "--force" in sys.argv
    manifest = json.loads(MANIFEST.read_text())
    existing_keys = {e["key"] for e in manifest}

    # assign global epic numbers in deterministic order
    epic_num = 15
    epic_map = {}  # (phase, epic_id) -> num
    files_by_phase = {}
    for ph in PHASES:
        fs = sorted((STORIES / ph).glob(f"{PHASE_UPPER[ph]}-*.md"))
        files_by_phase[ph] = fs
        seen_epics = []
        for f in fs:
            m = ID_RE.match(f.stem)
            eid = f"E{m.group(2)}" if m.group(2) else m.group(4)
            if eid not in seen_epics:
                seen_epics.append(eid)
        for eid in seen_epics:
            epic_num += 1
            epic_map[(ph, eid)] = epic_num

    created = []
    sprint_blocks = []  # (phase, epic_id, epic_num, epic_title, [(story_num, slug, sid)])
    epic_titles = {}

    for ph in PHASES:
        cur_epic_block = None
        for f in files_by_phase[ph]:
            body = f.read_text()
            sid = f.stem  # e.g. P2-E01-S01
            m = ID_RE.match(sid)
            eid = f"E{m.group(2)}" if m.group(2) else m.group(4)
            story_num = int(m.group(3) or m.group(5))
            enum = epic_map[(ph, eid)]

            title_line = body.splitlines()[0]
            title = title_line.split("—", 1)[1].strip() if "—" in title_line else title_line.lstrip("# ").strip()
            epic_meta = parse_meta(body, "Epic")  # "P2-E01 — Booking Engine"
            epic_title = epic_meta.split("—", 1)[1].strip() if "—" in epic_meta else eid
            epic_titles[(ph, eid)] = (enum, epic_title)

            jtbd = section(body, "Job To Be Done")
            acs = parse_acs(section(body, "Acceptance Criteria"))
            tech = section(body, "Technical Notes")
            tests = section(body, "Tests")
            deps = " ".join(section(body, "Dependencies").split())

            slug = slugify(title)
            key = f"{enum}-{story_num}-{slug}"
            out_path = IMPL / f"{key}.md"
            source_rel = f"_bmad-output/planning-artifacts/stories/{ph}/{sid}.md"

            story_block = build_story_block(jtbd)
            ac_block = "\n".join(f"{i+1}. {a}" for i, a in enumerate(acs)) or "1. See source spec."
            tasks = build_tasks(acs, tech, tests, epic_title, title)
            dev_notes, struct, refs = build_dev_notes(tech, deps, source_rel, PHASE_UPPER[ph], eid)

            content = f"""# Story {enum}.{story_num}: {title}

Status: backlog

> Canonical ID: {sid} · Phase: {PHASE_UPPER[ph]} · Source: {source_rel}

## Story

{story_block}
## Acceptance Criteria

{ac_block}

## Tasks / Subtasks

{tasks}

## Dev Notes

{dev_notes}

### Project Structure Notes
{struct}

### References
{refs}

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| {TODAY} | 0.1 | Dev-ready story created from planning spec | bmad-party-mode |
"""
            if out_path.exists() and not force:
                pass
            else:
                out_path.write_text(content)
                created.append(key)

            if key not in existing_keys:
                manifest.append({
                    "id": sid,
                    "epic_id": eid,
                    "epic_num": enum,
                    "story_num": story_num,
                    "title": title,
                    "slug": slug,
                    "key": key,
                    "source": source_rel,
                    "filename": f"{key}.md",
                })
                existing_keys.add(key)

            # collect for sprint-status
            if cur_epic_block is None or cur_epic_block[0] != enum:
                cur_epic_block = (enum, eid, epic_title, PHASE_UPPER[ph], [])
                sprint_blocks.append(cur_epic_block)
            cur_epic_block[4].append((story_num, slug, sid))

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    # emit sprint-status YAML
    lines = []
    for enum, eid, etitle, phup, stories in sprint_blocks:
        lines.append("")
        lines.append(f"  # Epic {enum} — {etitle}  ({phup}-{eid})")
        lines.append(f"  epic-{enum}: backlog")
        for snum, slug, sid in stories:
            lines.append(f"  {enum}-{snum}-{slug}: backlog  # {sid}")
        lines.append(f"  epic-{enum}-retrospective: optional")
    (IMPL / "_sprint_status_additions.yaml").write_text("\n".join(lines) + "\n")

    print(f"created {len(created)} story files")
    print(f"manifest now has {len(manifest)} entries")
    print("epic map:")
    for (ph, eid), num in epic_map.items():
        print(f"  {PHASE_UPPER[ph]}-{eid} -> epic-{num}")


if __name__ == "__main__":
    main()
