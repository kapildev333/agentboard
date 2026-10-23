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
    configFile: false,
    esbuild: { jsx: "automatic" },
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

for (const zoom of [0.5, 1.5]) {
  test(`records fps while panning at ${zoom * 100} percent`, async ({ page }) => {
    await page.goto(`${url}&zoom=${zoom}`);
    await page.waitForFunction(() => window.__terms?.length === 6);
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
    console.log(`L03 fps zoom=${zoom * 100}% renderer=webgl: ${result}`);
    expect(result).toBeGreaterThan(0);
  });
}
