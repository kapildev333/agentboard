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
    "spawn-b": { sh: 'agentboard spawn custom --id fake --worktree feature-b --prompt "edit README"' },
    "spawn-c": {
      mcp: [
        { name: "spawn_console", arguments: { agent: "custom", customId: "fake", cwd: h.repo, worktree: "feature-c" } },
        { name: "list_consoles", arguments: {} },
      ],
    },
    "edit-readme": { sh: 'printf "edited in %s\\n" "$(git branch --show-current)" >> README.md' },
  }));
  execFileSync("sh", ["-c", 'echo "# repo" > README.md && git add README.md && git -c user.name=e2e -c user.email=e2e@example.invalid commit -q -m readme'], { cwd: h.repo });
  d = await startDaemon(h);
});

test.afterAll(async () => {
  await d?.kill();
  h?.cleanup();
});

test.use({ actionTimeout: 15_000 });

// Matches the title element alone: the header also carries the agent mark and the status badge.
const consoleNode = (page: Page, title: string) =>
  page.locator(".react-flow__node-console").filter({ has: page.locator(".console-title", { hasText: new RegExp(`^${title}$`) }) });

/** Types a cue into a console and waits for the fake agent to report it ran; returns the cue's results. */
async function cue(page: Page, title: string, name: string) {
  const node = consoleNode(page, title);
  await node.locator(".xterm-screen").click();
  await page.keyboard.type(`${name}\n`);
  await expect(node.locator(".xterm-rows")).toContainText(`cue ${name} ok`);
  return JSON.parse(readFileSync(`${h.cues}.${name}.json`, "utf8")) as unknown[];
}

test("a console spawns two worktree consoles through the CLI and the MCP server and both branches show on their git cards", async ({ page }) => {
  const mainHead = git(h.repo, "rev-parse", "HEAD");
  const titles = ["Fake", "Fake: feature-b", "Fake: feature-c"];

  await test.step("(1) the board opens and shows the repo", async () => {
    await page.goto(await d.loginUrl(h.repo));
    await expect(page.getByTitle(h.repo)).toHaveText("repo");
  });

  await test.step("(2) console A is spawned from the UI", async () => {
    await spawnFake(page);
    await expect(consoleNode(page, "Fake").locator(".xterm-rows")).toContainText("fake>");
  });

  await test.step("(3) A runs agentboard spawn: console B in worktree feature-b", async () => {
    const [b] = (await cue(page, "Fake", "spawn-b")) as [{ stdout: string }];
    expect(JSON.parse(b.stdout)).toMatchObject({ worktree: { branch: "feature-b" } });
    await expect(consoleNode(page, "Fake: feature-b").locator(".xterm-rows")).toContainText("fake>");
  });

  await test.step("(4) A calls the MCP tool spawn_console: console C in feature-c; list_consoles returns three", async () => {
    const [spawned, listed] = (await cue(page, "Fake", "spawn-c")) as { content: { text: string }[] }[];
    expect(JSON.parse(spawned!.content[0]!.text)).toMatchObject({ worktree: { branch: "feature-c" } });
    expect((JSON.parse(listed!.content[0]!.text) as { title: string }[]).map((c) => c.title).sort()).toEqual(titles);
    await expect(consoleNode(page, "Fake: feature-c").locator(".xterm-rows")).toContainText("fake>");
    // The daemon puts every console a caller spawns at the same spot beside it (see Requests on L27),
    // so drag C below B by its header, as a user would.
    const [b, c] = await Promise.all(["Fake: feature-b", "Fake: feature-c"].map((t) => consoleNode(page, t).boundingBox()));
    const grip = (await consoleNode(page, "Fake: feature-c").locator("header").boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + c!.height + 80, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await consoleNode(page, "Fake: feature-c").boundingBox())!.y).toBeGreaterThanOrEqual(b!.y + b!.height);
  });

  await test.step("(5) B and C each commit a README.md change on their own branch through the git card", async () => {
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
  });

  await test.step("(6) both branches show on their git cards with ahead counts; main is untouched", async () => {
    for (const branch of ["feature-b", "feature-c"]) {
      const node = consoleNode(page, `Fake: ${branch}`);
      await expect(node.locator("b", { hasText: branch })).toBeVisible();
      await expect(node.getByText("ahead 1", { exact: true })).toBeVisible();
      expect(git(h.repo, "rev-list", "--count", `main..${branch}`)).toBe("1");
      expect(git(join(h.repo, ".worktrees", branch), "show", "HEAD:README.md")).toBe(`# repo\nedited in ${branch}`);
    }
    expect(git(h.repo, "rev-parse", "HEAD")).toBe(mainHead);
    expect(git(h.repo, "branch", "--show-current")).toBe("main");
    expect(git(h.repo, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(h.repo, "README.md"), "utf8")).toBe("# repo\n");
  });

  await test.step("(7) agentboard status --json lists the three consoles with their status", async () => {
    const out = execFileSync(process.execPath, [agentboardBin, "status", "--json"], { env: { ...process.env, AGENTBOARD_HOME: h.home }, encoding: "utf8" });
    const status = JSON.parse(out) as { alive: boolean; consoles: { title: string; status: string }[] };
    expect(status.alive).toBe(true);
    expect(status.consoles.map((c) => c.title).sort()).toEqual(titles);
    for (const c of status.consoles) expect(["working", "idle"]).toContain(c.status);
  });
});
