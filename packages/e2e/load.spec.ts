import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { makeHome, rss, spawnConsoles, startDaemon, type Daemon, type Home } from "./daemon.js";

let h: Home;
let d: Daemon;
const metrics: Record<string, number> = {};

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  h = makeHome();
  d = await startDaemon(h);
});
test.afterAll(async () => {
  await d?.kill();
  h?.cleanup();
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/metrics.json", JSON.stringify(metrics, null, 2));
  console.log("metrics", JSON.stringify(metrics));
});

// Times each keystroke from the keydown to the WebSocket message that carries its echo back for that console.
const probe = () => {
  const lat = { id: "", ch: "", t0: -1, samples: [] as number[] };
  (window as unknown as { __lat: typeof lat }).__lat = lat;
  window.addEventListener("keydown", () => (lat.t0 = performance.now()), true);
  const Base = window.WebSocket;
  window.WebSocket = class extends Base {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args);
      this.addEventListener("message", (ev) => {
        if (lat.t0 < 0) return;
        const m = JSON.parse(String(ev.data)) as { t: string; consoleId?: string; data?: string };
        if (m.t === "output" && m.consoleId === lat.id && m.data?.includes(lat.ch)) {
          lat.samples.push(performance.now() - lat.t0);
          lat.t0 = -1;
        }
      });
    }
  };
};

test("p95 keystroke echo stays under 50 ms while five other consoles print, and the daemon stays under 1 GB", async ({ page }) => {
  await page.addInitScript(probe);
  await page.goto(await d.loginUrl(h.repo));
  const nodes = await spawnConsoles(page, 6);
  for (let i = 1; i < 6; i++) {
    await nodes.nth(i).locator(".xterm-screen").click();
    await page.keyboard.type("spam\n");
  }
  const spamStart = Date.now();
  await expect(nodes.nth(5).locator(".xterm-rows")).toContainText("spam 1");
  const target = nodes.nth(0);
  const id = (await target.getAttribute("data-id"))!;
  await target.locator(".xterm-screen").click();
  // letters the spam lines never contain, so an echo is never mistaken for spam
  const letters = "bcdfghjklnoqrtuvwyz";
  for (let i = 0; i < 200; i++) {
    const ch = letters[i % letters.length]!;
    await page.evaluate(([id, ch]) => Object.assign((window as unknown as { __lat: object }).__lat, { id, ch, t0: -1 }), [id, ch]);
    await page.keyboard.press(ch);
    await page.waitForFunction((n) => (window as unknown as { __lat: { samples: number[] } }).__lat.samples.length > n, i);
  }
  const samples = await page.evaluate(() => (window as unknown as { __lat: { samples: number[] } }).__lat.samples);
  samples.sort((a, b) => a - b);
  metrics.keystrokes = samples.length;
  metrics.echoP50Ms = +samples[Math.floor(samples.length * 0.5)]!.toFixed(1);
  metrics.echoP95Ms = +samples[Math.ceil(samples.length * 0.95) - 1]!.toFixed(1);
  metrics.echoMaxMs = +samples.at(-1)!.toFixed(1);
  expect(samples).toHaveLength(200);
  expect(metrics.echoP95Ms).toBeLessThan(50);

  // all six print now; measure after a minute of output
  await page.keyboard.type("\nspam\n");
  await page.waitForTimeout(Math.max(0, 60_000 - (Date.now() - spamStart)));
  await expect(nodes.nth(1).locator(".xterm-rows")).toContainText("spam");
  const mem = rss(d.child.pid!);
  metrics.daemonRssMb = Math.round(mem.own / 2 ** 20);
  metrics.daemonPlusAgentsRssMb = Math.round(mem.tree / 2 ** 20);
  expect(mem.own).toBeLessThan(2 ** 30);
  expect(mem.tree).toBeLessThan(2 ** 30);
});
