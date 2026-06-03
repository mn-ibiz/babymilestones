#!/usr/bin/env python3
"""Mark an epic's stories reviewed in progress.json and record acted-on counts.
Usage: update_progress.py EPIC PATCHES DEFERRED DECISIONS DISMISSED [COMMIT_SHA]
Idempotent: safe to re-run after a restart."""
import json, sys, os
IMPL = os.path.join(os.path.dirname(__file__), "..")
P = os.path.join(os.path.dirname(__file__), "progress.json")
epic = int(sys.argv[1]); patches, deferred, decisions, dismissed = map(int, sys.argv[2:6])
commit = sys.argv[6] if len(sys.argv) > 6 else ""
prog = json.load(open(P))
n = 0
for w in prog["stories"]:
    if w["epic"] == epic and w["classification"] == "pending":
        w["review_state"] = "done"; n += 1
prog["epic_state"][str(epic)] = "done"
prog.setdefault("epic_results", {})[str(epic)] = {
    "stories_reviewed": n, "patches": patches, "deferred": deferred,
    "decisions_needed": decisions, "dismissed": dismissed, "commit": commit}
done = sum(1 for v in prog["epic_state"].values() if v == "done")
prog["epics_done"] = done
prog["epics_total"] = len(prog["epic_state"])
json.dump(prog, open(P, "w"), indent=2)
print(f"Epic {epic}: {n} stories -> done. patches={patches} defer={deferred} "
      f"decisions={decisions} dismissed={dismissed}. Epics done: {done}/{len(prog['epic_state'])}")
