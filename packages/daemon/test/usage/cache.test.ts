import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { UsageCache } from "../../src/usage/cache.js";

const fixtures = fileURLToPath(new URL("fixtures", import.meta.url));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "agentboard-usage-"));
  dirs.push(dir);
  cpSync(join(fixtures, "claude"), join(dir, "claude"), { recursive: true });
  const a = join(dir, "claude/-work-demo-api/aaaaaaaa-0000-4000-8000-000000000003.jsonl");
  const b = join(dir, "claude/-work-demo-shop/aaaaaaaa-0000-4000-8000-000000000002.jsonl");
  for (const f of [a, b]) utimesSync(f, 1_700_000_000, 1_700_000_000);
  const roots = { claude: [join(dir, "claude")], codex: [join(dir, "none")], gemini: [], opencode: [] };
  const cache = () => new UsageCache(join(dir, "home/usage.json"), () => roots);
  // Same size, new numbers: 30 becomes 31, 70 becomes 71.
  const bump = (f: string) => writeFileSync(f, readFileSync(f, "utf8").replace('"output_tokens":30', '"output_tokens":31').replace('"output_tokens":70', '"output_tokens":71'));
  const output = (sessions: { id: string; output: number }[], id: string) => sessions.find((s) => s.id.endsWith(id))!.output;
  return { dir, a, b, cache, bump, output };
}

test("an unchanged file is not re-read", async () => {
  const { dir, a, cache, bump, output } = setup();
  const first = await cache().refresh();
  expect(first.sessions).toHaveLength(3);
  expect(first.sources).toEqual([{ agent: "claude", path: join(dir, "claude"), files: 3 }, { agent: "codex", path: join(dir, "none"), files: 0 }]);
  expect(existsSync(join(dir, "home/usage.json"))).toBe(true);
  bump(a);
  utimesSync(a, 1_700_000_000, 1_700_000_000);
  // A new instance reads the cache file, so the session still shows the first read.
  expect(output((await cache().refresh()).sessions, "003")).toBe(30);
});

test("a changed mtime re-parses one file only", async () => {
  const { a, b, cache, bump, output } = setup();
  const c = cache();
  await c.refresh();
  bump(a);
  bump(b);
  utimesSync(a, 1_700_000_000, 1_700_000_000);
  utimesSync(b, 1_700_000_100, 1_700_000_100);
  const { sessions } = await c.refresh();
  expect([output(sessions, "003"), output(sessions, "002")]).toEqual([30, 121]);
});

test("a file that is gone drops out of the cache", async () => {
  const { a, cache } = setup();
  const c = cache();
  await c.refresh();
  rmSync(a);
  const { sessions, sources } = await c.refresh();
  expect(sessions.map((s) => s.id.slice(-3)).sort()).toEqual(["001", "002"]);
  expect(sources[0]!.files).toBe(2);
});
