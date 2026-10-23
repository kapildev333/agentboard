// Forwards a Claude Code hook's stdin JSON to the AgentBoard daemon. Never blocks or fails the session, never prints.
/* global fetch, AbortSignal */
import process from "node:process";

const { AGENTBOARD_URL: url, AGENTBOARD_CONSOLE_ID: id, AGENTBOARD_TOKEN: token = "" } = process.env;
if (!url || !id) process.exit(0);

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
try {
  const payload = JSON.parse(raw);
  await fetch(`${url}/hook/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AgentBoard-Token": token },
    body: JSON.stringify({ agent: "claude", event: payload.hook_event_name, payload }),
    signal: AbortSignal.timeout(3000),
  });
} catch {
  // daemon down or bad input: status falls back to output matching
}
process.exit(0);
