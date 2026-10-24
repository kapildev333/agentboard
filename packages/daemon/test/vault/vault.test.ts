import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { VaultIndex, VaultNote } from "@agentboard/shared";
import { afterEach, expect, test } from "vitest";
import { createVaultHandlers } from "../../src/vault/index.js";

type Routes = ReturnType<typeof createVaultHandlers>;
type Key = keyof Routes;
type Input<K extends Key> = Parameters<Routes[K]>[0];
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup(notes: Record<string, string>) {
  const repo = mkdtempSync(join(tmpdir(), "agentboard-vault-"));
  dirs.push(repo);
  for (const [p, text] of Object.entries(notes)) {
    mkdirSync(dirname(join(repo, "docs/vault", p)), { recursive: true });
    writeFileSync(join(repo, "docs/vault", p), text);
  }
  const h = createVaultHandlers({ repoOf: async (r) => r });
  return { repo, h, notes: (): Promise<VaultIndex> => call(h, "GET /api/vault/notes", { repo }) };
}

test("three notes with links produce the expected links and backlinks", async () => {
  const { notes } = setup({
    "a.md": "# Alpha\nsee [[Beta]] and [[Nowhere]]\n",
    "b.md": "# Beta\nback to [[alpha]]\n",
    "sub/c.md": "no heading here, links [[Alpha]]\n",
  });
  const idx = await notes();
  expect(idx.root).toBe("docs/vault");
  const by = Object.fromEntries(idx.notes.map((n) => [n.path, n]));
  expect(by["a.md"]).toMatchObject({ title: "Alpha", folder: "", links: ["Beta", "Nowhere"] });
  expect(by["a.md"].backlinks).toEqual(["b.md", "sub/c.md"]);
  expect(by["b.md"].backlinks).toEqual(["a.md"]);
  expect(by["sub/c.md"]).toMatchObject({ title: "c", folder: "sub", links: ["Alpha"], backlinks: [] });
});

function call<K extends Key>(h: Routes, key: K, input: Input<K>) {
  return (h[key] as (i: Input<K>, p: Record<string, string>) => ReturnType<Routes[K]>)(input, {});
}

test("an alias and a heading link resolve, case-insensitively", async () => {
  const { repo, h } = setup({
    "a.md": "# Alpha\n[[beta|the second]] and [[BETA#Setup]]\n",
    "b.md": "# Beta\n",
  });
  const note = await call(h, "GET /api/vault/note", { repo, path: "b.md" });
  expect(note.backlinks).toHaveLength(1);
  expect(note.backlinks[0]).toMatchObject({ path: "a.md", title: "Alpha" });
  expect(note.backlinks[0].excerpt.length).toBeLessThanOrEqual(90);
  expect(note.backlinks[0].excerpt).toContain("[[beta|the second]]");
  const a = await call(h, "GET /api/vault/note", { repo, path: "a.md" });
  expect(a.links).toEqual(["Beta"]);
});

test("a stale write gets 409; a current mtime saves", async () => {
  const { repo, h } = setup({ "a.md": "# A\n" });
  const n = await call(h, "GET /api/vault/note", { repo, path: "a.md" });
  await expect(call(h, "PUT /api/vault/note", { repo, path: "a.md", text: "x", mtime: n.mtime - 1000 })).rejects.toMatchObject({ status: 409 });
  const saved = await call(h, "PUT /api/vault/note", { repo, path: "a.md", text: "# A\nnew\n", mtime: n.mtime });
  expect(saved.text).toBe("# A\nnew\n");
});

test("append creates a missing note under the root and marks the author", async () => {
  const { repo, h } = setup({});
  const n = await call(h, "POST /api/vault/append", { repo, path: "ideas/x.md", text: "hello [[Y]]", author: "claude" });
  expect(n.text).toMatch(/^\n\n<!-- agentboard: by claude at \d{4}-\d\d-\d\dT[\d:.]+Z -->\nhello \[\[Y\]\]\n$/);
  const again = await call(h, "POST /api/vault/append", { repo, path: "ideas/x.md", text: "more", author: "codex" });
  expect(again.text.match(/agentboard: by/g)).toHaveLength(2);
  expect(n.links).toEqual(["Y"]);
});

test("the index picks up an edit through the cache", async () => {
  const { repo, h, notes } = setup({ "a.md": "# A\n" });
  expect((await notes()).notes[0].links).toEqual([]);
  await call(h, "PUT /api/vault/note", { repo, path: "a.md", text: "# A\n[[Z]]\n" });
  expect((await notes()).notes[0].links).toEqual(["Z"]);
});

test.each(["../x.md", "a/../../x.md", "/etc/passwd.md", "a.txt", "a\\b.md"])("refuses %s with 400", async (path) => {
  const { repo, h } = setup({});
  await expect(call(h, "GET /api/vault/note", { repo, path })).rejects.toMatchObject({ status: 400 });
  await expect(call(h, "PUT /api/vault/note", { repo, path, text: "x" })).rejects.toMatchObject({ status: 400 });
  await expect(call(h, "POST /api/vault/append", { repo, path, text: "x", author: "a" })).rejects.toMatchObject({ status: 400 });
});

test("a symlinked folder leaving the repo refuses a new note, and nothing is written outside", async () => {
  const { repo, h } = setup({});
  const outside = mkdtempSync(join(tmpdir(), "agentboard-outside-"));
  dirs.push(outside);
  symlinkSync(outside, join(repo, "docs/vault/link"), "dir");
  await expect(call(h, "PUT /api/vault/note", { repo, path: "link/new.md", text: "x" })).rejects.toMatchObject({ status: 400 });
  await expect(call(h, "POST /api/vault/append", { repo, path: "link/new.md", text: "x", author: "a" })).rejects.toMatchObject({ status: 400 });
  expect(existsSync(join(outside, "new.md"))).toBe(false);
});
