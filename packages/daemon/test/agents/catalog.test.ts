import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { AgentInfoListSchema } from "@agentboard/shared";
import { AgentCatalog } from "../../src/agents/index.js";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "agentboard-path-"));
  made.push(dir);
  return dir;
};

function stubDir(versions: Record<string, string>): string {
  const dir = tmp();
  for (const [name, v] of Object.entries(versions)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\necho ${v}\n`);
    chmodSync(file, 0o755);
  }
  return dir;
}

const neverRun = ((file: string) => {
  throw new Error(`scan must not run ${file}`);
}) as never;

test("scan finds the CLIs on a fake PATH by presence and X_OK only, never running them (D38)", async () => {
  const path = stubDir({ claude: "2.1.309", codex: "0.53.0", opencode: "1.19.4" });
  const list = await AgentCatalog.scan({ path, exec: neverRun });
  expect(AgentInfoListSchema.parse(list)).toEqual([
    { id: "claude", command: "claude", version: null, available: true },
    { id: "codex", command: "codex", version: null, available: true },
    { id: "gemini", command: "gemini", version: null, available: false },
    { id: "opencode", command: "opencode", version: null, available: true },
  ]);
});

test("readVersion runs --version once with a 3 second timeout, caches it, and scan then shows it (D38)", async () => {
  const path = stubDir({ claude: "x" });
  const calls: unknown[][] = [];
  const exec = ((file: string, args: string[], opts: unknown, cb: (e: null, out: string) => void) => {
    calls.push([file, args, opts]);
    cb(null, "9.9.9\n");
  }) as never;
  expect(await AgentCatalog.readVersion("claude", { path, exec })).toBe("9.9.9");
  expect(await AgentCatalog.readVersion("claude", { path, exec })).toBe("9.9.9");
  expect(calls).toHaveLength(1);
  expect(calls[0]![0]).toBe(join(path, "claude"));
  expect(calls[0]![1]).toEqual(["--version"]);
  expect(calls[0]![2]).toMatchObject({ timeout: 3000, killSignal: "SIGKILL" });
  const [claude] = await AgentCatalog.scan({ path, exec: neverRun });
  expect(claude).toEqual({ id: "claude", command: "claude", version: "9.9.9", available: true });
});

test("readVersion of a command not on the PATH runs nothing", async () => {
  expect(await AgentCatalog.readVersion("codex", { path: tmp(), exec: neverRun })).toBeNull();
});

test("a failing --version gives no version and is not cached", async () => {
  const path = stubDir({ gemini: "x" });
  let calls = 0;
  const exec = ((_f: string, _a: string[], _o: unknown, cb: (e: Error) => void) => (calls++, cb(new Error("boom")))) as never;
  expect(await AgentCatalog.readVersion("gemini", { path, exec })).toBeNull();
  expect(await AgentCatalog.readVersion("gemini", { path, exec })).toBeNull();
  expect(calls).toBe(2);
});

test("an exec that never calls back gives up after 3 seconds", async () => {
  vi.useFakeTimers();
  try {
    const path = stubDir({ codex: "x" });
    const reading = AgentCatalog.readVersion("codex", { path, exec: (() => {}) as never });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await reading).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("readVersion runs the CLI with the scanned PATH so an env-shebang CLI finds its interpreter", async () => {
  const path = stubDir({ claude: "x" });
  let env: Record<string, string> | undefined;
  const exec = ((_f: string, _a: string[], o: { env: Record<string, string> }, cb: (e: null, out: string) => void) => {
    env = o.env;
    cb(null, "1\n");
  }) as never;
  await AgentCatalog.readVersion("claude", { path, exec });
  expect(env?.PATH).toBe(path);
});

test("only the first line of --version output is kept", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "codex"), "#!/bin/sh\necho 1.2.3\necho extra\n");
  chmodSync(join(dir, "codex"), 0o755);
  expect(await AgentCatalog.readVersion("codex", { path: dir })).toBe("1.2.3");
});

test("resolve finds the file the scan saw, or null", () => {
  const path = stubDir({ claude: "x" });
  expect(AgentCatalog.resolve("claude", path)).toBe(join(path, "claude"));
  expect(AgentCatalog.resolve("codex", path)).toBeNull();
});

test("a non-executable stub stays unavailable", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "gemini"), "#!/bin/sh\necho 1\n");
  chmodSync(join(dir, "gemini"), 0o644);
  const gemini = (await AgentCatalog.scan({ path: dir })).find((a) => a.id === "gemini");
  expect(gemini).toMatchObject({ available: false, version: null });
});

test("a custom agent can be given by absolute path", async () => {
  const dir = stubDir({ mytool: "1" });
  const command = join(dir, "mytool");
  const [entry] = (await AgentCatalog.scan({ path: "", custom: [{ id: "a", name: "A", command, args: [] }] })).filter(
    (a) => a.id === "custom",
  );
  expect(entry).toMatchObject({ command, available: true, customId: "a" });
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
