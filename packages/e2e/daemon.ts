import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const bin = fileURLToPath(new URL("../daemon/dist/bin.js", import.meta.url));
export const fakeAgent = fileURLToPath(new URL("./fake-agent/index.mjs", import.meta.url));

export type Home = { root: string; home: string; repo: string; path: string; cleanup(): void };

/** A temp AGENTBOARD_HOME with the fake agent registered as a custom agent, a git repo, and an empty PATH for the catalog. */
export function makeHome(): Home {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "agentboard-e2e-")));
  const [home, repo, path] = ["home", "repo", "path"].map((d) => join(root, d)) as [string, string, string];
  for (const d of [home, repo, path]) mkdirSync(d);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const settings = {
    fontSize: 13,
    customAgents: [{ id: "fake", name: "Fake", command: process.execPath, args: [fakeAgent], needsYou: "approve\\?" }],
  };
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings));
  return { root, home, repo, path, cleanup: () => rmSync(root, { recursive: true, force: true }) };
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
