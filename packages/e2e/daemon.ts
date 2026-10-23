import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const bin = fileURLToPath(new URL("../daemon/dist/bin.js", import.meta.url));
export const fakeAgent = fileURLToPath(new URL("./fake-agent/index.mjs", import.meta.url));

export const agentboardBin = fileURLToPath(new URL("../cli/bin/agentboard.js", import.meta.url));
const mcpBin = fileURLToPath(new URL("../mcp/bin/agentboard-mcp.js", import.meta.url));

export type Home = { root: string; home: string; repo: string; path: string; cues: string; cleanup(): void };
/** What the fake agent runs when a cue name is typed: a shell line, or MCP tools/call requests in order. */
export type Cue = { sh: string } | { mcp: { name: string; arguments: Record<string, unknown> }[] };

/**
 * A temp AGENTBOARD_HOME with the fake agent registered as a custom agent, a git repo, and an empty PATH for the catalog.
 * `cues` go to a file the fake agent reads, run with the built agentboard and agentboard-mcp bins first on PATH and
 * AGENTBOARD_HOME pinned to the temp home, so a cue never reaches the owner's own daemon.
 */
export function makeHome(cues: (h: Home) => Record<string, Cue> = () => ({})): Home {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agentboard-e2e-")));
  const [home, repo, path, bin] = ["home", "repo", "path", "bin"].map((d) => join(root, d)) as [string, string, string, string];
  for (const d of [home, repo, path, bin]) mkdirSync(d);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  symlinkSync(agentboardBin, join(bin, "agentboard"));
  symlinkSync(mcpBin, join(bin, "agentboard-mcp"));
  const h: Home = { root, home, repo, path, cues: join(root, "cues.json"), cleanup: () => rmSync(root, { recursive: true, force: true }) };
  const env = { AGENTBOARD_HOME: home, PATH: [bin, dirname(process.execPath), process.env.PATH].join(":") };
  writeFileSync(h.cues, JSON.stringify({ env, cues: cues(h) }));
  const settings = {
    fontSize: 13,
    customAgents: [{ id: "fake", name: "Fake", command: process.execPath, args: [fakeAgent, h.cues], needsYou: "approve\\?" }],
  };
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings));
  return h;
}

export type Daemon = { child: ChildProcess; origin: string; port: number; token: string; loginUrl(repo: string): Promise<string>; kill(): Promise<void> };

/** Runs the built `agentboard-daemon` bin on a random free port; never a third-party agent (D31). */
export async function startDaemon(h: Home): Promise<Daemon> {
  const child = spawn(process.execPath, [bin], {
    cwd: h.repo,
    env: { ...process.env, AGENTBOARD_HOME: h.home, AGENTBOARD_AGENT_PATH: h.path },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const origin = await new Promise<string>((resolve, reject) => {
    child.once("exit", (code) => reject(new Error(`daemon exited (${code})`)));
    createInterface({ input: child.stdout! }).once("line", resolve);
  });
  const { port, token } = JSON.parse(readFileSync(join(h.home, "daemon.json"), "utf8")) as { port: number; token: string };
  return {
    child,
    origin,
    port,
    token,
    async loginUrl(repo) {
      const res = await fetch(`${origin}/auth/code`, { method: "POST", headers: { "x-agentboard-token": token } });
      const { code } = (await res.json()) as { code: string };
      return `${origin}/?code=${code}&repo=${encodeURIComponent(repo)}`;
    },
    kill: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGKILL");
      }),
  };
}

/** Spawns the fake agent through the UI's spawn dialog. */
export async function spawnFake(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Spawn console" }).click();
  const dialog = page.getByRole("dialog", { name: "Spawn console" });
  await dialog.getByLabel(/Fake/).check();
  await dialog.getByRole("button", { name: "Spawn" }).click();
  await expect(dialog).toBeHidden();
}

/** Spawns n fake consoles and waits for every prompt. */
export async function spawnConsoles(page: Page, n: number) {
  for (let i = 0; i < n; i++) await spawnFake(page);
  const nodes = page.locator(".react-flow__node-console");
  await expect(nodes).toHaveCount(n);
  for (let i = 0; i < n; i++) await expect(nodes.nth(i).locator(".xterm-rows")).toContainText("fake>");
  return nodes;
}

/** Resident set size in bytes of a pid, and of it plus every descendant. */
export function rss(pid: number): { own: number; tree: number } {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number) as [number, number, number]);
  const tree = new Set([pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [p, pp] of rows)
      if (tree.has(pp) && !tree.has(p)) {
        tree.add(p);
        grew = true;
      }
  }
  const kb = (p: number) => rows.find((r) => r[0] === p)?.[2] ?? 0;
  return { own: kb(pid) * 1024, tree: [...tree].reduce((sum, p) => sum + kb(p), 0) * 1024 };
}
