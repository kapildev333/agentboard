import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { transcribe } from "../../src/voice/index.js";

const fake = fileURLToPath(new URL("../../../e2e/fake-transcriber/index.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  delete process.env.FAKE_TRANSCRIBER_FAIL;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const home = () => dirs[dirs.push(mkdtempSync(join(tmpdir(), "agentboard-voice-"))) - 1]!;
const left = (h: string) => { try { return readdirSync(join(h, "voice")); } catch { return []; } };

test("the fake transcriber's sentence comes back and the temp file is gone", async () => {
  const h = home();
  const r = await transcribe(Buffer.from("x"), "audio/webm", `${process.execPath} ${fake}`, h);
  expect(r.text).toBe("close the two idle consoles and resume the docs pass");
  expect(r.engine).toBe("node");
  expect(r.ms).toBeGreaterThanOrEqual(0);
  expect(left(h)).toEqual([]);
});

test("a failing command rejects with its stderr line and still removes the file", async () => {
  const h = home();
  process.env.FAKE_TRANSCRIBER_FAIL = "1";
  await expect(transcribe(Buffer.from("x"), "audio/ogg", `${process.execPath} ${fake}`, h)).rejects.toThrow("fake failure");
  expect(left(h)).toEqual([]);
});
