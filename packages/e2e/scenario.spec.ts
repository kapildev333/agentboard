import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { agentboardBin, makeHome, spawnFake, startDaemon, type Daemon, type Home } from "./daemon.js";

let h: Home;
let d: Daemon;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

test.beforeAll(async () => {
  h = makeHome((h) => ({
    "spawn-b": { sh: 'agentboard spawn custom --worktree feature-b --prompt "edit README"' },
    "spawn-c": {
      mcp: [
        { name: "spawn_console", arguments: { agent: "custom", customId: "fake", cwd: h.repo, worktree: "feature-c" } },
        { name: "list_consoles", arguments: {} },
      ],
    },
    "edit-readme": { sh: 'printf "edited in %s\\n" "$(git branch --show-current)" >> README.md' },
  }));
  git(h.repo, "-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "commit", "-q", "--allow-empty", "-m", "init");
  execFileSync("sh", ["-c", 'echo "# repo" > README.md && git add README.md && git -c user.name=e2e -c user.email=e2e@example.invalid commit -q -m readme'], { cwd: h.repo });
  d = await startDaemon(h);
});

test.afterAll(async () => {
  await d?.kill();
  h?.cleanup();
});

const consoleNode = (page: Page, title: string) =>
  page.locator(".react-flow__node-console").filter({ has: page.locator("header", { hasText: new RegExp(`^${title} `) }) });

/** Types a cue into a console and waits for the fake agent to report it ran. */
async function cue(page: Page, title: string, name: string) {
  const node = consoleNode(page, title);
  await node.locator(".xterm-screen").click();
  await page.keyboard.type(`${name}\n`);
  await expect(node.locator(".xterm-rows")).toContainText(`cue ${name} ok`);
  return JSON.parse(readFileSync(`${h.cues}.${name}.json`, "utf8")) as unknown[];
}

test("a console spawns two worktree consoles through the CLI and the MCP server and both branches show on their git cards", async ({ page }) => {
  const mainHead = git(h.repo, "rev-parse", "HEAD");

  // (1) the board opens and shows the repo
  await page.goto(await d.loginUrl(h.repo));
  await expect(page.getByTitle(h.repo)).toHaveText("repo");

  // (2) console A from the UI
  await spawnFake(page);
  await expect(consoleNode(page, "Fake").locator(".xterm-rows")).toContainText("fake>");

  // (3) A runs the CLI: console B in worktree feature-b
  const [b] = (await cue(page, "Fake", "spawn-b")) as [{ stdout: string }];
  expect(JSON.parse(b.stdout)).toMatchObject({ worktree: { branch: "feature-b" } });
  await expect(consoleNode(page, "Fake: feature-b").locator(".xterm-rows")).toContainText("fake>");

  // (4) A calls the MCP server: console C in worktree feature-c, and list_consoles returns all three
  const [spawned, listed] = (await cue(page, "Fake", "spawn-c")) as { content: { text: string }[] }[];
  expect(JSON.parse(spawned!.content[0]!.text)).toMatchObject({ worktree: { branch: "feature-c" } });
  const titles = (JSON.parse(listed!.content[0]!.text) as { title: string }[]).map((c) => c.title).sort();
  expect(titles).toEqual(["Fake", "Fake: feature-b", "Fake: feature-c"]);
  await expect(consoleNode(page, "Fake: feature-c").locator(".xterm-rows")).toContainText("fake>");

  // (5) B and C each edit README.md and commit it on their own branch through the git card
  for (const branch of ["feature-b", "feature-c"]) {
    const title = `Fake: ${branch}`;
    await cue(page, title, "edit-readme");
    const node = consoleNode(page, title);
    await node.getByRole("button", { name: "Git" }).click();
    await expect(node.locator("b", { hasText: branch })).toBeVisible();
    await expect(node.getByText("dirty 1")).toBeVisible();
    await node.getByRole("button", { name: "Diff" }).click();
    await expect(node.locator("li", { hasText: "README.md" })).toBeVisible();
    await expect(node.locator("pre .added", { hasText: `+edited in ${branch}` })).toBeVisible();
    await node.getByRole("button", { name: "Commit" }).click();
    await node.getByLabel("Commit message").fill(`edit README on ${branch}`);
    await node.getByRole("button", { name: "Submit" }).click();
    await expect(node.getByText(`edit README on ${branch}`)).toBeVisible();
    await expect(node.getByText("dirty 0")).toBeVisible();
  }

  // (6) both branches on their git cards with ahead counts; the main checkout is untouched
  for (const branch of ["feature-b", "feature-c"]) {
    const node = consoleNode(page, `Fake: ${branch}`);
    await expect(node.locator("b", { hasText: branch })).toBeVisible();
    await expect(node.getByText(/^ahead \d+$/)).toBeVisible();
    expect(git(h.repo, "rev-list", "--count", `main..${branch}`)).toBe("1");
    expect(git(join(h.repo, ".worktrees", branch), "show", "HEAD:README.md")).toBe(`# repo\nedited in ${branch}`);
  }
  expect(git(h.repo, "rev-parse", "HEAD")).toBe(mainHead);
  expect(git(h.repo, "branch", "--show-current")).toBe("main");
  expect(git(h.repo, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(h.repo, "README.md"), "utf8")).toBe("# repo\n");

  // (7) agentboard status --json lists the three consoles with their status
  const status = JSON.parse(
    execFileSync(process.execPath, [agentboardBin, "status", "--json"], { env: { ...process.env, AGENTBOARD_HOME: h.home }, encoding: "utf8" }),
  ) as { alive: boolean; consoles: { title: string; status: string }[] };
  expect(status.alive).toBe(true);
  expect(status.consoles.map((c) => c.title).sort()).toEqual(titles);
  for (const c of status.consoles) expect(["working", "idle"]).toContain(c.status);
});
