// Forwards a Claude Code hook's stdin JSON to the AgentBoard daemon. Never blocks or fails the session.
/* global fetch, AbortSignal */
import process from "node:process";

const { AGENTBOARD_URL: url, AGENTBOARD_CONSOLE_ID: id, AGENTBOARD_TOKEN: token = "" } = process.env;
if (!url || !id) process.exit(0);

let body = "";
for await (const chunk of process.stdin) body += chunk;
try {
  await fetch(`${url}/hook/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AgentBoard-Token": token },
    body,
    signal: AbortSignal.timeout(3000),
  });
} catch {
  // daemon down: status falls back to output matching
}
process.exit(0);
