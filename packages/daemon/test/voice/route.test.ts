import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import fixtures from "../../../shared/src/fixtures/routes.json" with { type: "json" };
import { startDaemon } from "../../src/app.js";

const fake = fileURLToPath(new URL("../../../e2e/fake-transcriber/index.mjs", import.meta.url));
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
  delete process.env.AGENTBOARD_HOME;
  delete process.env.FAKE_TRANSCRIBER_FAIL;
});

async function start() {
  const root = mkdtempSync(join(tmpdir(), "agentboard-voice-route-"));
  const d = await startDaemon({ repoPath: root, home: root });
  cleanup.push(() => d.close(), () => rmSync(root, { recursive: true, force: true }));
  const post = (type: string, body: string | Buffer = "x") =>
    fetch(`${d.origin}/api/voice/transcribe`, { method: "POST", headers: { "x-agentboard-token": d.token, "content-type": type }, body });
  const configure = () =>
    fetch(`${d.origin}/api/settings`, {
      method: "PUT",
      headers: { "x-agentboard-token": d.token, "content-type": "application/json" },
      body: JSON.stringify({ fontSize: 13, customAgents: [], voice: { transcribeCommand: `${process.execPath} ${fake}`, holdKey: "alt+space" } }),
    });
  return { root, post, configure };
}

test("POST /api/voice/transcribe without a configured command answers 412", async () => {
  const { post } = await start();
  const res = await post("audio/webm");
  expect(res.status).toBe(412);
  expect(await res.json()).toEqual({ error: "no transcriber configured: set Settings › Voice › transcribe command (for example whisper-cli -nt -f)" });
});

test("with the fake transcriber configured through PUT /api/settings the sentence comes back", async () => {
  const { post, configure, root } = await start();
  await configure();
  const res = await post("audio/webm;codecs=opus");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ text: "close the two idle consoles and resume the docs pass", engine: "node" });
  expect(readdirSync(join(root, "voice"))).toEqual([]);
});

test("a JSON content type answers 415", async () => {
  const { post, configure } = await start();
  await configure();
  expect((await post("application/json", "{}")).status).toBe(415);
});

test("a body over 10 MB answers 413", async () => {
  const { post, configure } = await start();
  await configure();
  expect((await post("audio/wav", Buffer.alloc(10 * 1024 * 1024 + 1))).status).toBe(413);
});

test("a failing transcriber answers 502 with its message", async () => {
  const { post, configure } = await start();
  await configure();
  process.env.FAKE_TRANSCRIBER_FAIL = "1";
  const res = await post("audio/ogg");
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: "fake failure" });
});

test("the command routes answer 501 until L52", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentboard-stub-"));
  const d = await startDaemon({ repoPath: root, home: root });
  cleanup.push(() => d.close(), () => rmSync(root, { recursive: true, force: true }));
  for (const key of ["POST /api/command/plan", "POST /api/command/run"] as const) {
    const res = await fetch(`${d.origin}${key.slice(5)}`, {
      method: "POST",
      headers: { "x-agentboard-token": d.token, "content-type": "application/json" },
      body: JSON.stringify(fixtures[key].request),
    });
    expect(res.status, key).toBe(501);
  }
});
