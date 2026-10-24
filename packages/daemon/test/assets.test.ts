import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { startDaemon } from "../src/app.js";
import { AssetStore, imageSize } from "../src/assets/index.js";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

async function boot() {
  const root = mkdtempSync(join(tmpdir(), "agentboard-assets-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const d = await startDaemon({ repoPath: root, home: join(root, "home") });
  cleanup.push(() => d.close());
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${d.origin}${path}`, { ...init, headers: { "x-agentboard-token": d.token, ...init.headers } });
  return { root, call };
}

test("a PNG posted comes back by id with its width and height and the same bytes", async () => {
  const { call } = await boot();
  const bytes = png(640, 480);
  const post = await call("/api/assets", { method: "POST", headers: { "content-type": "image/png" }, body: bytes });
  expect(post.status).toBe(201);
  const { id, width, height } = await post.json() as { id: string; width: number; height: number };
  expect([width, height]).toEqual([640, 480]);
  expect(id).toMatch(/^[0-9a-f]{64}$/);
  const get = await call(`/api/assets/${id}`);
  expect(get.status).toBe(200);
  expect(get.headers.get("content-type")).toBe("image/png");
  expect(get.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(Buffer.from(await get.arrayBuffer())).toEqual(bytes);
});

test("posting the same bytes twice stores one file", async () => {
  const { root, call } = await boot();
  const send = () => call("/api/assets", { method: "POST", headers: { "content-type": "image/png" }, body: png(2, 3) });
  const a = (await (await send()).json()) as { id: string }, b = (await (await send()).json()) as { id: string };
  expect(a.id).toBe(b.id);
  expect(readdirSync(join(root, "home", "assets"))).toEqual([`${a.id}.png`]);
});

test("an svg is 415", async () => {
  const { call } = await boot();
  const res = await call("/api/assets", { method: "POST", headers: { "content-type": "image/svg+xml" }, body: "<svg/>" });
  expect(res.status).toBe(415);
});

test("11 MB is 413", async () => {
  const { call } = await boot();
  const res = await call("/api/assets", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.alloc(11 * 1024 * 1024) });
  expect(res.status).toBe(413);
});

test("a body that is not the image it claims is 400", async () => {
  const { call } = await boot();
  const res = await call("/api/assets", { method: "POST", headers: { "content-type": "image/png" }, body: "nope" });
  expect(res.status).toBe(400);
});

test("a 20-byte truncated PNG header is 400", async () => {
  const { call } = await boot();
  const res = await call("/api/assets", { method: "POST", headers: { "content-type": "image/png" }, body: png(8, 8).subarray(0, 20) });
  expect(res.status).toBe(400);
});

test("a bad id is 404 without touching the disk", async () => {
  const { root, call } = await boot();
  for (const id of ["abc", "..%2F..%2Fdaemon.json", "A".repeat(64)]) expect((await call(`/api/assets/${id}`)).status).toBe(404);
  expect((await call(`/api/assets/${"0".repeat(64)}`)).status).toBe(404);
  expect(() => readdirSync(join(root, "home", "assets"))).toThrow(); // a read never creates the directory
});

test("dimensions come from the header of each format", () => {
  const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([7, 0, 9, 0])]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3]);
  const vp8x = Buffer.alloc(30);
  vp8x.write("RIFF", 0); vp8x.write("WEBP", 8); vp8x.write("VP8X", 12);
  vp8x.writeUIntLE(99, 24, 3); vp8x.writeUIntLE(49, 27, 3);
  const vp8l = Buffer.alloc(25);
  vp8l.write("RIFF", 0); vp8l.write("WEBP", 8); vp8l.write("VP8L", 12);
  vp8l[20] = 0x2f; vp8l.writeUInt32LE((15 | (7 << 14)) >>> 0, 21);
  const vp8 = Buffer.alloc(30);
  vp8.write("RIFF", 0); vp8.write("WEBP", 8); vp8.write("VP8 ", 12);
  vp8.set([0x9d, 0x01, 0x2a], 23); vp8.writeUInt16LE(321, 26); vp8.writeUInt16LE(123, 28);
  expect(imageSize(gif, "image/gif")).toEqual({ width: 7, height: 9 });
  expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 30, height: 20 });
  expect(imageSize(vp8x, "image/webp")).toEqual({ width: 100, height: 50 });
  expect(imageSize(vp8l, "image/webp")).toEqual({ width: 16, height: 8 });
  expect(imageSize(vp8, "image/webp")).toEqual({ width: 321, height: 123 });
});

test("AssetStore.get answers undefined for a malformed id", async () => {
  const store = new AssetStore(mkdtempSync(join(tmpdir(), "agentboard-store-")));
  expect(await store.get("x")).toBeUndefined();
});
