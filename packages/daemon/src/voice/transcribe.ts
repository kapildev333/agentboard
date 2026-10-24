import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { TranscribeResponse } from "@agentboard/shared";

const run = promisify(execFile);
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav" };
export const AUDIO_TYPES = Object.keys(EXT);

// Words, with single or double quotes grouping; no escapes and no shell.
const words = (line: string) => [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!);

/** Writes the audio under <home>/voice, runs `command <file>` and returns its trimmed stdout (D46, D50). */
export async function transcribe(audio: Buffer, mime: string, command: string, home: string, timeoutMs = 30_000): Promise<TranscribeResponse> {
  const [file, ...args] = words(command);
  if (!file) throw new Error("empty transcribe command");
  const dir = join(home, "voice");
  const path = join(dir, `${randomUUID()}.${EXT[mime] ?? "webm"}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path, audio, { mode: 0o600 });
  const start = Date.now();
  try {
    const { stdout } = await run(file, [...args, path], { timeout: timeoutMs });
    return { text: String(stdout).trim(), ms: Date.now() - start, engine: basename(file) };
  } catch (e) {
    const err = e as { killed?: boolean; stderr?: string; message: string };
    const line = String(err.stderr ?? "").split("\n").find((l) => l.trim());
    throw new Error(line ?? (err.killed ? `transcriber timed out after ${timeoutMs} ms` : err.message), { cause: e });
  } finally {
    await rm(path, { force: true });
  }
}
