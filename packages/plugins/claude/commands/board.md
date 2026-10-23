---
description: Open this repo on the AgentBoard board
---

Run `agentboard open .`. Report the URL it prints to the user in one line.

If the command is missing, say that the agentboard CLI is not on PATH and that it is linked from the AgentBoard checkout with `npm run build && npm link -w @agentboard/cli`. Do not try to get it any other way (no npx, no npm install): the npm package with that name is unrelated.
