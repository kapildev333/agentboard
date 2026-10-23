scope: <colon-separated paths this lane owns, exactly as the lane table says>
model: claude-sonnet-5-5

Lane <ID> · issue #<n> · you are in your own worktree and branch; push with `git push -u origin HEAD` · scope: <paths>
Spec: docs/superpowers/specs/2026-10-23-agentboard-design.md, section "<name>". Task card: <ID> in docs/superpowers/plans/2026-10-23-multi-agent-build-plan.md. Rules: CLAUDE.md.

Produce: <names, signatures and files from the card, verbatim>
Start from this failing test: <file and test name>

Loop, per behaviour: write the failing test, run it and see it fail, implement the smallest code that passes, run it green, commit `test:` then `feat:`. Keep the whole suite green.
Before the PR: `scripts/gate.sh` must print PASS. If main moved, `git fetch origin && git rebase origin/main` first.
PR: `git push -u origin HEAD`; fill `.claude/pr-template.md` into a scratch file; `gh pr create --title "<ID>: <title>" --body-file <that file>`; `gh issue comment <n> --body "<what you built, gate result, decisions, requests>"`.
Outside your scope? Do not touch it; write it under Requests in the PR body. A choice the card leaves open? Decide it and note it under Decisions.
Then stop. Do not merge. Do not wait for review.
