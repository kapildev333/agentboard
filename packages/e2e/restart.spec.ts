import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Board } from "@agentboard/shared";
import { makeHome, spawnConsoles, startDaemon, type Daemon, type Home } from "./daemon.js";

let h: Home;
let d: Daemon;
test.beforeAll(async () => {
  h = makeHome();
  d = await startDaemon(h);
});
test.afterAll(async () => {
  await d?.kill();
  h?.cleanup();
});

const onDisk = (h: Home) =>
  readdirSync(join(h.home, "boards"))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => (JSON.parse(readFileSync(join(h.home, "boards", f), "utf8")) as Board).workspaces.flatMap((w) => w.nodes.map((n) => n.id)))
    .sort();

const statuses = (page: import("@playwright/test").Page) =>
  page.locator(".react-flow__node-console header [data-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));

test("a reload shows the same six consoles with their status; a daemon restart shows them stopped with a working Resume", async ({ page }) => {
  await page.goto(await d.loginUrl(h.repo));
  const nodes = await spawnConsoles(page, 6);
  // one console waits on the user, so the statuses are not all alike
  await nodes.nth(2).locator(".xterm-screen").click();
  await page.keyboard.type("ask\n");
  await expect(nodes.nth(2).locator("header [data-status]")).toHaveAttribute("data-status", "needs_you");
  const ids = await nodes.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const before = await statuses(page);

  await page.reload();
  await expect(nodes).toHaveCount(6);
  expect(await nodes.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(ids);
  expect(await statuses(page)).toEqual(before);
  // the daemon outlived the tab: the terminals replay and stay live
  await expect(nodes.nth(0).locator(".xterm-rows")).toContainText("fake>");

  // F1.6 allows a second for a change to reach disk; a crash inside that window may lose it
  await expect.poll(() => onDisk(h), { timeout: 1000 }).toEqual([...ids].sort());
  await d.kill(); // a crash, not a clean close: consoles stay "working" on disk
  d = await startDaemon(h);
  await page.goto(await d.loginUrl(h.repo));
  await expect(nodes).toHaveCount(6);
  expect(await nodes.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")))).toEqual(ids);
  expect(await statuses(page)).toEqual(Array(6).fill("stopped"));
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(6);

  await nodes.nth(0).getByRole("button", { name: "Resume" }).click();
  await expect(nodes.nth(0).locator(".xterm-rows")).toContainText("fake>");
  await expect(nodes.nth(0).locator("header [data-status]")).not.toHaveAttribute("data-status", "stopped");
  await expect(nodes.nth(0).getByRole("button", { name: "Resume" })).toHaveCount(0);
  await nodes.nth(0).locator(".xterm-screen").click();
  await page.keyboard.type("back\n");
  await expect(nodes.nth(0).locator(".xterm-rows")).toContainText("you said: back");
});
