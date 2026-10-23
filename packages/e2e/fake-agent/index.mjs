// Stands in for every agent CLI in the e2e (ruling D31): prints a prompt, echoes what is typed,
// answers each line and posts a hook event per line. `spam` prints a line every 10 ms until Ctrl-C;
// `ask` prints a question the custom needs-you rule matches.
import readline from "node:readline";

const { AGENTBOARD_URL: url, AGENTBOARD_CONSOLE_ID: id, AGENTBOARD_TOKEN: token } = process.env;
const hook = (event, payload = {}) =>
  fetch(`${url}/hook/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ agent: "custom", event, payload }),
  }).catch(() => {});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: "fake> " });
let spam;
const stop = () => { clearInterval(spam); spam = undefined; };
rl.on("line", (line) => {
  void hook("line", { text: line });
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
