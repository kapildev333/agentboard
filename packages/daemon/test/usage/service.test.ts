import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import type { ConsoleNode } from "@agentboard/shared";
import { UsageService, scanRoots } from "../../src/usage/index.js";

const fixtures = fileURLToPath(new URL("fixtures", import.meta.url));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const node = (id: string, sessionId?: string): ConsoleNode => ({
  id, type: "console", title: id, x: 0, y: 0, w: 1, h: 1, agent: "claude", cwd: "/work/demo/shop",
  ...(sessionId && { session: { provider: "claude" as const, id: sessionId } }), status: "idle", createdAt: "", lastActiveAt: "",
});

test("tokensSince sums a console's turns in the window, null without a parsed log", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentboard-usage-"));
  dirs.push(dir);
  const usage = new UsageService({
    file: join(dir, "usage.json"),
    roots: () => ({ claude: [join(fixtures, "claude")], codex: [], gemini: [], opencode: [] }),
    consoles: () => [node("c1", "aaaaaaaa-0000-4000-8000-000000000001"), node("c2", "not-logged"), node("c3")],
  });
  const t = (s: string) => new Date(s);
  expect(await usage.tokensSince("c1", t("2026-10-20T08:00:00Z"), t("2026-10-20T09:10:00Z"))).toBe(610);
  expect(await usage.tokensSince("c1", t("2026-10-20T08:00:00Z"), t("2026-10-20T10:00:00Z"))).toBe(1830);
  expect(await usage.tokensSince("c2", t("2026-10-20T08:00:00Z"), t("2026-10-20T10:00:00Z"))).toBeNull();
  expect(await usage.tokensSince("c3", t("2026-10-20T08:00:00Z"), t("2026-10-20T10:00:00Z"))).toBeNull();
  expect(await usage.tokensSince("gone", t("2026-10-20T08:00:00Z"), t("2026-10-20T10:00:00Z"))).toBeNull();
});

test("scan roots are the CLIs' own folders plus each profile's config dir", () => {
  const roots = scanRoots("/h", [
    { id: "p1", agent: "claude", name: "work", env: { CLAUDE_CONFIG_DIR: "/h/.claude-work" }, args: [] },
    { id: "p2", agent: "codex", name: "alt", env: { CODEX_HOME: "/h/.codex-alt" }, args: [] },
    { id: "p3", agent: "claude", name: "plain", env: {}, args: [] },
  ]);
  expect(roots).toEqual({
    claude: ["/h/.claude/projects", "/h/.claude-work/projects"],
    codex: ["/h/.codex/sessions", "/h/.codex-alt/sessions"],
    gemini: ["/h/.gemini/tmp"],
    opencode: ["/h/.local/share/opencode"],
  });
});
