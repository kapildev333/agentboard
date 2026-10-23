import { createServer, type ViteDevServer } from "vite";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
// @ts-expect-error plain .mjs spike module without types
import { startEcho } from "../../ui/spike/echo-server.mjs";

let vite: ViteDevServer;
let echo: { port: number; close: () => void };
let url: string;

test.beforeAll(async () => {
  echo = await startEcho(0);
  vite = await createServer({
    root: new URL("../../ui/spike", import.meta.url).pathname,
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
  });
  await vite.listen();
  url = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}/?ws=${echo.port}`;
});

test.afterAll(async () => {
  echo.close();
  await vite.close();
});

test("typing hello into the third node echoes it back", async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__terms?.length === 6);
  await page.locator(".react-flow__node").nth(2).locator(".xterm").click();
  await page.keyboard.type("hello");
  await expect
    .poll(() => page.evaluate(() => window.__terms[2].buffer.active.getLine(0)?.translateToString(true)))
    .toBe("hello");
});

test("a node drags by its header, also while its terminal is focused", async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__terms?.length === 6);
  const node = page.locator(".react-flow__node").nth(0);
  await node.locator(".xterm").click();
  const before = await node.boundingBox();
  const header = (await node.locator(".drag-handle").boundingBox())!;
  await page.mouse.move(header.x + 20, header.y + 5);
  await page.mouse.down();
  await page.mouse.move(header.x + 120, header.y + 55, { steps: 5 });
  await page.mouse.up();
  const after = await node.boundingBox();
  // React Flow starts the drag after the first move event, so expect most of the 100 px, not all
  expect(after!.x - before!.x).toBeGreaterThan(60);
  expect(after!.y - before!.y).toBeGreaterThan(30);
});

for (const renderer of ["webgl", "dom"]) {
  for (const zoom of [0.5, 1, 1.5]) {
    test(`records fps while panning at ${zoom * 100} percent with ${renderer}`, async ({ page }, info) => {
      await page.goto(`${url}&zoom=${zoom}&renderer=${renderer}`);
      await page.waitForFunction(() => window.__terms?.length === 6);
      // webgl must really be on: one canvas per terminal beyond xterm's own layers
      const canvases = await page.locator(".xterm canvas").count();
      expect(canvases > 0).toBe(renderer === "webgl");
      await page.locator(".react-flow__node").nth(0).locator(".xterm").click();
      await page.keyboard.type("hello world".repeat(8));
      await page.mouse.click(5, 5);
      const fps = page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frames = 0;
            const end = performance.now() + 2000;
            const tick = () => (performance.now() < end ? (frames++, requestAnimationFrame(tick)) : resolve(frames / 2));
            requestAnimationFrame(tick);
          }),
      );
      // the viewport starts offset so (5, 5) is empty pane
      await page.mouse.move(5, 5);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++) {
        await page.mouse.move(5 + i * 5, 5 + i * 3);
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
      const result = await fps;
      const cols = await page.evaluate(() => window.__terms[0].cols);
      console.log(`L03 cols=${cols} fps zoom=${zoom * 100}% renderer=${renderer}: ${result}`);
      await page.screenshot({ path: info.outputPath(`${renderer}-${zoom * 100}.png`) });
      expect(result).toBeGreaterThan(0);
    });
  }
}

test("keystroke echo latency stays low with six consoles", async ({ page }) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__terms?.length === 6);
  await page.locator(".react-flow__node").nth(2).locator(".xterm").click();
  const ms = await page.evaluate(async () => {
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      const n = window.__terms[2].buffer.active.getLine(0)!.translateToString(true).length;
      window.__terms[2].input("x");
      while (window.__terms[2].buffer.active.getLine(0)!.translateToString(true).length === n) await new Promise((r) => setTimeout(r, 0));
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b);
  });
  console.log(`L03 echo latency ms: median=${ms[15].toFixed(1)} p95=${ms[28].toFixed(1)}`);
  expect(ms[28]).toBeLessThan(50);
});
