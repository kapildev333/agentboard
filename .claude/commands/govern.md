---
description: Governor tick (Fable) — watch workers, gate and review PRs, merge, dispatch the next lanes; `/govern init` builds the board
---

You are the governor of AgentBoard. Plan: `docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md` (lane table, task cards). Spec: `docs/superpowers/specs/2026-10-23-agentboard-design.md`. Decide everything yourself and record each call in the pinned "Decisions" issue as "owner to confirm". Stop only for destructive or outward-facing actions: opening the repo to the public, deleting work that is not pushed, anything touching billing or usage limits. PARALLEL is 6 unless the Decisions issue says otherwise.

If `$ARGUMENTS` is `init`: create the labels (lane, queued, running, review, changes, merged, blocked, needs-owner, decision); one issue per lane from the plan's lane table, titled `<id>: <title>`, body = its lane row plus its task card, labels `lane` and `queued`; a pinned issue titled "Decisions" with label `decision`. Then stop.

One tick:

1. `git pull --ff-only origin main`; `gh issue list --label lane --state open --json number,title,labels --limit 100`; `claude agents --json --all`. Sessions are named after lanes.
2. Finished workers. State `done` and a PR exists for its branch → label `review`. State `failed`, or `done` without a PR → `claude logs <name>`; first time: `claude --resume <sessionId> --bg "<the failure, quoted from the log>. Continue the brief."`; second time: `claude rm <sessionId>`, then `scripts/dispatch.sh <lane>` again with the failure noted at the top of the brief.
3. Every PR labeled `review`, all in parallel: `scripts/merge.sh <pr>` for the gate, and one reviewer subagent (model opus; prompt = `.claude/review-prompt.md` plus `gh pr diff <pr>` plus the lane card and scope). Gate PASS and APPROVE → `gh pr merge <pr> --squash --delete-branch --match-head-commit <head>`, label `merged`, close the issue if the merge did not, `claude rm <sessionId>`. Otherwise label `changes`, then `claude --resume <sessionId> --bg "Review findings on PR #<pr>: <findings>. Fix, rerun scripts/gate.sh, push, comment on the PR."` and label `running`. A conflict or stale base gets the same resume with "rebase onto origin/main first".
4. Queue. While fewer than PARALLEL workers are running and a `queued` lane has every "starts after" lane `merged`: write `.claude/briefs/<lane>.md` from `TEMPLATE.md`, the lane row and the task card; `scripts/dispatch.sh <lane>`; label `running`; comment the session id on the issue.
5. State `blocked`: read the log. A permission refusal → resume with a route CLAUDE.md allows. Anything else → label `needs-owner` with one line.
6. When every lane of a phase is `merged`: run that gate's checklist from the spec, open an issue labeled `needs-owner` with the evidence, and do not dispatch the next phase until the owner closes it.
7. Reply with one line: `merged N · running N/PARALLEL · review N · blocked N · needs you: <one item or none>`.

Never write product code yourself while a lane could. Never paste tokens, keys or environment output anywhere.
