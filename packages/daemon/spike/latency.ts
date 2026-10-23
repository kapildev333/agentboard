// Spike: spawn pty-ws.ts, open six sockets, time 200 keystroke echoes per shell, report p50/p95/max and RSS.
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const SHELLS = 6;
const KEYS = 200;

export const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
};

const rssMb = (pids: number[]) =>
  pids.reduce((t, pid) => t + Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString()), 0) / 1024;

const children = (pid: number) => {
  try {
    return execFileSync("pgrep", ["-P", String(pid)]).toString().split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
};

async function typeKeys(port: number): Promise<{ times: number[]; ws: WebSocket }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  let onData: (d: string) => void = () => {};
  ws.on("message", (d) => onData(d.toString()));
  await new Promise((r) => ws.once("open", r));
  await new Promise((r) => setTimeout(r, 500)); // let the prompt arrive
  const times: number[] = [];
  for (let i = 0; i < KEYS; i++) {
    const ch = String.fromCharCode(97 + (i % 26));
    const t0 = performance.now();
    await new Promise<void>((done) => {
      onData = (d) => d.includes(ch) && done();
      ws.send(ch);
    });
    times.push(performance.now() - t0);
  }
  return { times, ws };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(new URL("./pty-ws.ts", import.meta.url))]);
  const port = Number(await new Promise<string>((r) => server.stdout.once("data", (d) => r(d.toString()))));
  const baseline = rssMb([server.pid!]);
  const runs = await Promise.all(Array.from({ length: SHELLS }, () => typeKeys(port)));
  const kids = children(server.pid!);
  const serverMb = rssMb([server.pid!]);
  const shellsMb = rssMb(kids);
  const all = runs.flatMap((r) => r.times);
  runs.forEach((r) => r.ws.close());
  const f = (n: number) => n.toFixed(2);
  console.log(`${SHELLS} shells x ${KEYS} keystrokes, echo round trip ms: p50 ${f(percentile(all, 50))} p95 ${f(percentile(all, 95))} max ${f(Math.max(...all))}`);
  console.log(`server RSS MB: idle ${f(baseline)}, with ${kids.length} shells ${f(serverMb)}; shell processes total ${f(shellsMb)} (${f(shellsMb / Math.max(kids.length, 1))} each)`);
  server.kill();
}
