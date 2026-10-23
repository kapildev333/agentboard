// Stands in for every agent CLI in the e2e (ruling D31): prints a prompt, echoes what is typed,
// answers each line and posts a hook event per line. `spam` prints a line every 10 ms until Ctrl-C;
// `ask` prints a question the custom needs-you rule matches. With a cues file as its argument
// ({env, cues}), typing a cue's name runs it the way a real agent's tools would: `sh` through a shell,
// `mcp` as tools/call requests to agentboard-mcp over stdio. The results go to <file>.<cue>.json and
// the console prints `cue <name> ok` or `cue <name> failed: <why>`.
/* global fetch, setInterval, clearInterval */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import readline from "node:readline";

const { AGENTBOARD_URL: url, AGENTBOARD_CONSOLE_ID: id, AGENTBOARD_TOKEN: token } = process.env;
const hook = (event, payload = {}) =>
  fetch(`${url}/hook/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ agent: "custom", event, payload }),
  }).catch(() => {});

const cuesFile = process.argv[2];
const { env: cueEnv = {}, cues = {} } = cuesFile ? JSON.parse(readFileSync(cuesFile, "utf8")) : {};
const env = { ...process.env, ...cueEnv };

const sh = (line) =>
  new Promise((resolve) => {
    const child = spawn("sh", ["-c", line], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.on("close", (code) => resolve([{ code, stdout, stderr }]));
  });

// One agentboard-mcp process per cue: initialize, then each tools/call in order.
async function mcp(calls) {
  const child = spawn("agentboard-mcp", [], { env, stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (l) => {
    const msg = JSON.parse(l);
    waiting.get(msg.id)?.(msg);
  });
  const request = (rid, method, params) =>
    new Promise((resolve) => {
      waiting.set(rid, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: rid, method, params })}\n`);
    });
  try {
    await request(0, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-agent", version: "0" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const out = [];
    for (const [i, call] of calls.entries()) {
      const res = await request(i + 1, "tools/call", call);
      if (res.error || res.result.isError) throw new Error(JSON.stringify(res.error ?? res.result.content));
      out.push(res.result);
    }
    return out;
  } finally {
    child.kill();
  }
}

async function runCue(name, c) {
  try {
    const out = c.sh ? await sh(c.sh) : await mcp(c.mcp);
    writeFileSync(`${cuesFile}.${name}.json`, JSON.stringify(out));
    const failed = out.find((r) => r.code);
    process.stdout.write(failed ? `cue ${name} failed: ${failed.stdout}${failed.stderr}\r\n` : `cue ${name} ok\r\n`);
  } catch (e) {
    process.stdout.write(`cue ${name} failed: ${e.message}\r\n`);
  }
  rl.prompt();
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: "fake> " });
let spam;
const stop = () => { clearInterval(spam); spam = undefined; };
rl.on("line", (line) => {
  void hook("line", { text: line });
  if (Object.hasOwn(cues, line)) return void runCue(line, cues[line]);
  if (line === "spam") {
    let n = 0;
    spam = setInterval(() => process.stdout.write(`spam ${n++} ${"x".repeat(60)}\r\n`), 10);
    return;
  }
  if (line === "ask") process.stdout.write("approve? (y/n)\r\n");
  else process.stdout.write(`you said: ${line}\r\n`);
  rl.prompt();
});
rl.on("SIGINT", () => { stop(); process.stdout.write("^C\r\n"); rl.prompt(); });
rl.on("close", () => process.exit(0));
void hook("start");
rl.prompt();
