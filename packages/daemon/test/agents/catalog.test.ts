import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { AgentInfoListSchema } from "@agentboard/shared";
import { AgentCatalog } from "../../src/agents/index.js";

function stubDir(versions: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentboard-path-"));
  for (const [name, v] of Object.entries(versions)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\necho ${v}\n`);
    chmodSync(file, 0o755);
  }
  return dir;
}

test("scan finds the CLIs on a fake PATH with their versions", async () => {
  const path = stubDir({ claude: "2.1.309", codex: "0.53.0", opencode: "1.19.4" });
  const list = await AgentCatalog.scan({ path });
  expect(AgentInfoListSchema.parse(list)).toEqual([
    { id: "claude", command: "claude", version: "2.1.309", available: true },
    { id: "codex", command: "codex", version: "0.53.0", available: true },
    { id: "gemini", command: "gemini", version: null, available: false },
    { id: "opencode", command: "opencode", version: "1.19.4", available: true },
  ]);
});

test("scan runs --version with a 3 second timeout through the injected exec", async () => {
  const path = stubDir({ claude: "x" });
  const calls: unknown[][] = [];
  const exec = ((file: string, args: string[], opts: unknown, cb: (e: null, out: string) => void) => {
    calls.push([file, args, opts]);
    cb(null, "9.9.9\n");
  }) as never;
  const [claude] = await AgentCatalog.scan({ path, exec });
  expect(claude.version).toBe("9.9.9");
  expect(calls[0][1]).toEqual(["--version"]);
  expect(calls[0][2]).toMatchObject({ timeout: 3000, killSignal: "SIGKILL" });
});

test("a failing --version leaves the agent available with no version", async () => {
  const path = stubDir({ gemini: "x" });
  const exec = ((_f: string, _a: string[], _o: unknown, cb: (e: Error) => void) => cb(new Error("boom"))) as never;
  const gemini = (await AgentCatalog.scan({ path, exec })).find((a) => a.id === "gemini");
  expect(gemini).toEqual({ id: "gemini", command: "gemini", version: null, available: true });
});

test("an exec that never calls back gives up after 3 seconds", async () => {
  vi.useFakeTimers();
  try {
    const path = stubDir({ codex: "x" });
    const exec = (() => {}) as never;
    const scanning = AgentCatalog.scan({ path, exec });
    await vi.advanceTimersByTimeAsync(3000);
    const codex = (await scanning).find((a) => a.id === "codex");
    expect(codex).toEqual({ id: "codex", command: "codex", version: null, available: true });
  } finally {
    vi.useRealTimers();
  }
});

test("custom agents are available when their command resolves", async () => {
  const path = stubDir({ mytool: "1" });
  const custom = [
    { id: "a", name: "A", command: "mytool", args: [] },
    { id: "b", name: "B", command: "nope", args: [] },
  ];
  const list = await AgentCatalog.scan({ path, custom });
  expect(list.filter((a) => a.id === "custom")).toEqual([
    { id: "custom", command: "mytool", version: null, available: true, customId: "a", name: "A" },
    { id: "custom", command: "nope", version: null, available: false, customId: "b", name: "B" },
  ]);
});
