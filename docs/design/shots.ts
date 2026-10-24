import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startDaemon, type Daemon, type Home } from "../../packages/e2e/daemon.js";

// A board on a temp repo named demo, run with the fake agent only (D31) and an empty agent PATH (D38).
// Everything lives under /tmp so no home path shows on screen.
const out = (name: string) => fileURLToPath(new URL(`${process.env.SHOTS === "before" ? "before-" : ""}${name}.png`, import.meta.url));
const cli = fileURLToPath(new URL("../../packages/cli/dist/bin.js", import.meta.url));
const fake = fileURLToPath(new URL("../../packages/e2e/fake-agent/index.mjs", import.meta.url));

let h: Home;
let d: Daemon;

test.beforeAll(async () => {
  const root = realpathSync(mkdtempSync("/tmp/ab-"));
  const [home, repo, path, bin] = ["home", "demo", "path", "bin"].map((n) => join(root, n)) as [string, string, string, string];
  for (const dir of [home, repo, path, bin]) mkdirSync(dir);
  symlinkSync(process.execPath, join(bin, "node"));
  copyFileSync(fake, join(bin, "fake-agent.mjs"));
  const git = (...a: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=demo", "-c", "user.email=demo@example.com", ...a]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "# demo\n\nA board for the screenshots.\n");
  git("add", ".");
  git("commit", "-qm", "chore: start the demo");
  writeFileSync(join(repo, "README.md"), "# demo\n\nA board for the design screenshots.\nNow with a second line.\n");
  const settings = {
    fontSize: 13,
    customAgents: [{ id: "fake", name: "Fake", command: join(bin, "node"), args: [join(bin, "fake-agent.mjs")], needsYou: "approve\\?" }],
  };
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings));
  h = { root, home, repo, path, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  d = await startDaemon(h);
});

test.afterAll(async () => {
  await d?.kill();
  h?.cleanup();
});

const spawn = async (page: Page, branch?: string) => {
  await page.getByRole("button", { name: "Spawn console" }).click();
  const dialog = page.getByRole("dialog", { name: "Spawn console" });
  await dialog.getByLabel(/Fake/).check();
  if (branch) {
    await dialog.getByLabel("new worktree").check();
    await dialog.getByLabel("branch name").fill(branch);
  }
  await dialog.getByRole("button", { name: "Spawn" }).click();
  await expect(dialog).toBeHidden();
};

const type = async (page: Page, i: number, text: string) => {
  await page.locator(".react-flow__node-console").nth(i).locator(".xterm-screen").click();
  await page.keyboard.type(`${text}\n`);
};

test("screenshots", async ({ page }) => {
  await page.goto(await d.loginUrl(h.repo));
  await expect(page.getByRole("button", { name: "Spawn console" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("01-empty-board") });

  await page.getByRole("button", { name: "Spawn console" }).click();
  const dialog = page.getByRole("dialog", { name: "Spawn console" });
  await dialog.getByLabel(/Fake/).check();
  await dialog.getByLabel("new worktree").check();
  await dialog.getByLabel("branch name").fill("feat-login");
  await dialog.getByLabel("first prompt").fill("Add a login page");
  await page.screenshot({ path: out("02-spawn-dialog") });
  await page.getByRole("button", { name: "Spawn console" }).click();
  await expect(dialog).toBeHidden();

  await spawn(page);
  await spawn(page, "feat-login");
  await spawn(page);
  const nodes = page.locator(".react-flow__node-console");
  await expect(nodes).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(nodes.nth(i).locator(".xterm-rows")).toContainText("fake>");
  await type(page, 0, "hello from the design check");
  await type(page, 1, "ask");
  await expect(nodes.nth(1).locator("header [data-status]")).toHaveAttribute("data-status", "needs_you");
  execFileSync(process.execPath, [cli, "note", "Ship the login page today. Review the diff first.", "--repo", h.repo], { env: { ...process.env, AGENTBOARD_HOME: h.home } });
  await expect(page.getByText("Ship the login page")).toBeVisible();
  await page.mouse.click(700, 820);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("03-three-consoles") });

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("04-settings") });
  await page.getByRole("button", { name: "Settings" }).click();

  await nodes.nth(0).getByRole("button", { name: "Git" }).click();
  await nodes.nth(0).getByText("Diff").click();
  await expect(nodes.nth(0).getByText("Now with a second line.")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("05-git-card") });
});
