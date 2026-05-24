#!/usr/bin/env python3
"""
Splits a consolidated phase stories markdown file into one file per story.

Usage:
    python3 _splitter.py <source.md> <output_dir> <phase_label>

Source format expectations:
    - Stories begin with: "### {STORY-ID} — {title}"
    - Stories belong to epics beginning with: "## {EPIC-ID} — {epic title}"
    - Story content runs until next "### " or "## " header.
    - Each story may carry: **JTBD:**, **AC:**, **Tech:**, **Tests:**, **Deps:**, **DoD:**

The output file is a standalone story doc with frontmatter and clean sections.
"""

import re
import sys
import os
from pathlib import Path

DOD_BLURB = (
    "Standard DoD applies. A story is **Done** when:\n"
    "1. Code reviewed by another engineer.\n"
    "2. All AC have a passing test (unit, integration, or E2E as appropriate).\n"
    "3. Migrations are additive-only.\n"
    "4. Audited actions write to `audit_outbox`.\n"
    "5. Deployed to staging.\n"
    "6. PM + designer walked through the staging build for the affected surface.\n"
    "7. No regression in `e2e/` suite.\n"
)


def split_sections(text: str):
    """Yield (epic_id, epic_title, story_id, story_title, body) tuples."""
    # Match epic headers (## EPIC-ID — Title) and story headers (### STORY-ID — Title)
    lines = text.split("\n")
    current_epic_id = None
    current_epic_title = None
    in_story = False
    current_story_id = None
    current_story_title = None
    current_body = []

    epic_re = re.compile(r"^##\s+([A-Z0-9]+-?E?[0-9a-zA-Z]*)\s+—\s+(.+)$")
    story_re = re.compile(r"^###\s+([A-Z0-9]+-E?[0-9]+-S[0-9]+|X[0-9]+-S[0-9]+)\s+—\s+(.+)$")

    for line in lines:
        epic_m = epic_re.match(line)
        story_m = story_re.match(line)

        if story_m:
            if in_story:
                yield (current_epic_id, current_epic_title, current_story_id, current_story_title, "\n".join(current_body).strip())
            current_story_id = story_m.group(1)
            current_story_title = story_m.group(2).strip()
            current_body = []
            in_story = True
        elif epic_m:
            if in_story:
                yield (current_epic_id, current_epic_title, current_story_id, current_story_title, "\n".join(current_body).strip())
                in_story = False
                current_body = []
            current_epic_id = epic_m.group(1)
            current_epic_title = epic_m.group(2).strip()
        else:
            if in_story:
                current_body.append(line)

    if in_story:
        yield (current_epic_id, current_epic_title, current_story_id, current_story_title, "\n".join(current_body).strip())


def parse_body(body: str):
    """Extract semi-structured fields from the body using bold markers."""
    # Pattern for **Label:** ... (until next **Label:** or end)
    field_re = re.compile(r"\*\*(JTBD|AC|Tech|Tests|Deps|DoD|Decision refs|Estimate|Status|Notes):\*\*\s*(.*?)(?=\n\*\*[A-Z][A-Za-z ]+:\*\*|\Z)", re.DOTALL)
    fields = {}
    for m in field_re.finditer(body):
        key = m.group(1).strip()
        val = m.group(2).strip()
        fields[key] = val
    return fields


def render_story(epic_id, epic_title, story_id, story_title, body, phase_label):
    fields = parse_body(body)

    jtbd = fields.get("JTBD", "").strip()
    ac = fields.get("AC", "").strip()
    tech = fields.get("Tech", "").strip()
    tests = fields.get("Tests", "").strip()
    deps = fields.get("Deps", "").strip()
    notes = fields.get("Notes", "").strip()
    decision_refs = fields.get("Decision refs", "").strip()
    estimate = fields.get("Estimate", "1–3 days").strip()
    status = fields.get("Status", "Ready for development").strip()

    out = []
    out.append(f"# {story_id} — {story_title}")
    out.append("")
    out.append(f"**Status:** {status}")
    out.append(f"**Phase:** {phase_label}")
    if epic_id and epic_title:
        out.append(f"**Epic:** {epic_id} — {epic_title}")
    out.append(f"**Estimate:** {estimate}")
    if decision_refs:
        out.append(f"**Spec decisions:** {decision_refs}")
    out.append("")

    if jtbd:
        out.append("## Job To Be Done")
        out.append("")
        out.append(jtbd)
        out.append("")

    if ac:
        out.append("## Acceptance Criteria")
        out.append("")
        # If AC is a bullet list, render as-is. Otherwise inline.
        if ac.lstrip().startswith("-"):
            out.append(ac)
        else:
            out.append(ac)
        out.append("")

    if tech:
        out.append("## Technical Notes")
        out.append("")
        out.append(tech)
        out.append("")

    if tests:
        out.append("## Tests")
        out.append("")
        out.append(tests)
        out.append("")

    if deps:
        out.append("## Dependencies")
        out.append("")
        # Normalize the deps line into bullets when it's comma-separated
        if "," in deps and not deps.lstrip().startswith("-"):
            for d in [x.strip().rstrip(".") for x in deps.split(",")]:
                if d:
                    out.append(f"- {d}")
        else:
            out.append(deps)
        out.append("")

    if notes:
        out.append("## Notes")
        out.append("")
        out.append(notes)
        out.append("")

    out.append("## Definition of Done")
    out.append("")
    out.append(DOD_BLURB)
    out.append("## References")
    out.append("")
    out.append("- Source spec: `Baby-Milestones-Spec.md` v2.1")
    if epic_id:
        out.append(f"- Parent epic: `epics.md` § {epic_id}")
    out.append("")

    return "\n".join(out)


def main():
    if len(sys.argv) != 4:
        print("Usage: _splitter.py <source.md> <output_dir> <phase_label>", file=sys.stderr)
        sys.exit(1)

    source = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    phase_label = sys.argv[3]

    out_dir.mkdir(parents=True, exist_ok=True)
    text = source.read_text()

    count = 0
    for epic_id, epic_title, story_id, story_title, body in split_sections(text):
        rendered = render_story(epic_id, epic_title, story_id, story_title, body, phase_label)
        out_file = out_dir / f"{story_id}.md"
        out_file.write_text(rendered)
        count += 1

    print(f"Wrote {count} story files to {out_dir}")


if __name__ == "__main__":
    main()
