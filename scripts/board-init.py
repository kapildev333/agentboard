#!/usr/bin/env python3
"""Create one GitHub issue per lane from the build plan's two tables, plus the pinned Decisions issue.
Idempotent: an issue whose title already exists is left alone.
Run: python3 -I scripts/board-init.py [plan.md] [phase]; no arguments means the MVP plan, phase from the lane id.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md")
PHASE = sys.argv[2] if len(sys.argv) > 2 else None
SPEC = "docs/superpowers/specs/2026-10-23-agentboard-design.md"


def gh(*args, inp=None):
    return subprocess.run(["gh", *args], input=inp, text=True, capture_output=True, check=True).stdout.strip()


def rows(section_title):
    """Rows of the first pipe table under the given '## ' heading, as lists of cells."""
    text = PLAN.read_text()
    start = text.index("\n## " + section_title) + 1  # a prefix: "Work breakdown" matches "Work breakdown for phase 4"
    end = text.find("\n## ", start + 3)
    out = []
    for line in text[start:end].splitlines():
        if re.match(r"^\| L[0-9][0-9A-Z] \|", line):
            out.append([c.strip() for c in line.strip().strip("|").split("|")])
    return out


lanes = {r[0]: r for r in rows("Work breakdown")}
cards = {r[0]: r for r in rows("Task cards")}
existing = {i["title"] for i in json.loads(gh("issue", "list", "--state", "all", "--limit", "200", "--json", "title"))}

created = 0
for lane, (lid, title, owns, after, model) in lanes.items():
    full = f"{lid}: {title}"
    if full in existing:
        continue
    _, produces, first_test, done = cards[lid]
    phase = lid[1]
    body = "\n".join([
        f"Lane {lid} · phase {phase} · model {model}",
        f"Owns: {owns}",
        f"Starts after: {after}",
        "",
        f"Produces: {produces}",
        f"First failing test: {first_test}",
        f"Done when: {done}",
        "",
        f"Plan: {PLAN.relative_to(ROOT)} · Spec: {SPEC}",
        "One state label at a time: queued → running → review → merged (or changes, blocked, needs-owner).",
    ])
    gh("issue", "create", "--title", full, "--body", body, "--label", "lane", "--label", "queued")
    created += 1

if "Decisions" not in existing:
    body = "\n".join([
        "The governor records its calls here as \"owner to confirm\"; the owner comments or edits a row to overrule.",
        "",
        "| # | Date | Decision | Status |",
        "| --- | --- | --- | --- |",
        "| D1 | 2026-10-23 | PARALLEL = 6 worker sessions; raise to 8 when memory and the rate limit allow | Owner approved |",
        "| D2 | 2026-10-23 | Models: workers claude-sonnet-5-5, reviewers Opus, governor Fable 5.1 | Owner approved |",
        "| D3 | 2026-10-23 | Repo kapildev333/agentboard stays private; MIT when opened; the owner picks the day | Owner approved |",
        "| D4 | 2026-10-23 | The governor may run overnight unattended: decide everything, record it here, never touch limits or billing | Owner approved |",
        "| D5 | 2026-10-23 | Lane branches and worktrees are created by claude -w; pull request titles carry the lane id | Governor, owner to confirm |",
    ])
    url = gh("issue", "create", "--title", "Decisions", "--body", body, "--label", "decision")
    gh("issue", "pin", url.rsplit("/", 1)[-1])
    created += 1

print(f"board-init: {created} issues created, {len(lanes)} lanes in the plan")
