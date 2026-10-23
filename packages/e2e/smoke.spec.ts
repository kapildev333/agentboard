import { expect, test } from "@playwright/test";
import { makeHome, spawnFake, startDaemon, type Daemon, type Home } from "./daemon.js";

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

test("six consoles show live output and status", async ({ page }) => {
  await page.goto(await d.loginUrl(h.repo));
  for (let i = 0; i < 6; i++) await spawnFake(page);
  const nodes = page.locator(".react-flow__node-console");
  await expect(nodes).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    const node = nodes.nth(i);
    await expect(node.locator(".xterm-rows")).toContainText("fake>");
    await node.locator(".xterm-screen").click();
    await page.keyboard.type(`hello ${i}\n`);
    await expect(node.locator(".xterm-rows")).toContainText(`you said: hello ${i}`);
    await expect(node.locator("header [data-status]")).toHaveAttribute("data-status", "working");
  }
  await expect(page.getByRole("complementary", { name: "Mission map" }).getByRole("group", { name: "Working" }).getByRole("button")).toHaveCount(6);
});
