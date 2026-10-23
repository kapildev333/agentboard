import http from "node:http";
import { expect, test } from "@playwright/test";
import { makeHome, startDaemon, type Daemon, type Home } from "./daemon.js";

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

function request(headers: Record<string, string>, method = "GET", path = "/api/status"): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: d.port, method, path, headers }, (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on("error", reject);
    req.end(method === "GET" ? undefined : "{}");
  });
}

test("a foreign Origin carrying the board's cookie is refused, and so is a non-localhost Host", async ({ page, context }) => {
  await page.goto(await d.loginUrl(h.repo));
  await expect(page.getByRole("button", { name: "Spawn console" })).toBeVisible();
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  expect(cookie).toMatch(new RegExp(`agentboard_${d.port}=`));
  const host = `127.0.0.1:${d.port}`;

  // the cookie alone works from the board's own origin
  expect(await request({ host, cookie, origin: d.origin })).toBe(200);
  // a page elsewhere, even on another localhost port, cannot use it
  for (const origin of ["http://evil.example", "http://127.0.0.1:1"]) {
    expect(await request({ host, cookie, origin })).toBe(403);
    expect(await request({ host, cookie, origin, "content-type": "application/json" }, "PUT", "/api/settings")).toBe(403);
    expect(await request({ host, cookie, origin, connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" }, "GET", "/ws")).toBe(403);
  }
  // DNS rebinding: a foreign Host is refused even with the token
  expect(await request({ host: `evil.example:${d.port}`, "x-agentboard-token": d.token })).toBe(403);
  expect(await request({ host, "x-agentboard-token": d.token })).toBe(200);
});
