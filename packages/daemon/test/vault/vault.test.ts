import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  const note: VaultNote = await call(h, "GET /api/vault/note", { repo, path: "b.md" });
  expect(note.backlinks).toHaveLength(1);
  expect(note.backlinks[0]).toMatchObject({ path: "a.md", title: "Alpha" });
  expect(note.backlinks[0].excerpt.length).toBeLessThanOrEqual(90);
  expect(note.backlinks[0].excerpt).toContain("[[beta|the second]]");
  const a: VaultNote = await call(h, "GET /api/vault/note", { repo, path: "a.md" });
  expect(a.links).toEqual(["Beta"]);
});

test("a stale write gets 409; a current mtime saves", async () => {
  const { repo, h } = setup({ "a.md": "# A\n" });
  const n: VaultNote = await call(h, "GET /api/vault/note", { repo, path: "a.md" });
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
  mkdirSync(join(repo, "docs/vault"), { recursive: true });
  symlinkSync(outside, join(repo, "docs/vault/link"), "dir");
  await expect(call(h, "PUT /api/vault/note", { repo, path: "link/new.md", text: "x" })).rejects.toMatchObject({ status: 400 });
  await expect(call(h, "POST /api/vault/append", { repo, path: "link/new.md", text: "x", author: "a" })).rejects.toMatchObject({ status: 400 });
  expect(existsSync(join(outside, "new.md"))).toBe(false);
});

test("two concurrent appends both land", async () => {
  const { repo, h } = setup({});
  await Promise.all(["one", "two", "three", "four"].map((text, i) => call(h, "POST /api/vault/append", { repo, path: "n.md", text, author: `a${i}` })));
  const n: VaultNote = await call(h, "GET /api/vault/note", { repo, path: "n.md" });
  for (const t of ["one", "two", "three", "four"]) expect(n.text).toContain(`\n${t}\n`);
  expect(n.text.match(/agentboard: by/g)).toHaveLength(4);
});

test.each(["./a.md", "sub//a.md", "sub/./a.md", "docs/vault/sub/a.md"])("%s names the same note as its canonical path", async (path) => {
  const { repo, h } = setup({ "sub/a.md": "# A\n" });
  const canonical = "sub/a.md";
  const probe = path === "./a.md" ? "a.md" : canonical;
  if (probe === "a.md") await call(h, "PUT /api/vault/note", { repo, path: "a.md", text: "# A\n" });
  const n: VaultNote = await call(h, "GET /api/vault/note", { repo, path });
  expect(n.path).toBe(probe);
  const w: VaultNote = await call(h, "PUT /api/vault/note", { repo, path, text: "# A\nw\n" });
  expect(w.path).toBe(probe);
  const p: VaultNote = await call(h, "POST /api/vault/append", { repo, path, text: "x", author: "me" });
  expect(p.path).toBe(probe);
  expect(existsSync(join(repo, "docs/vault/docs"))).toBe(false);
});

test("two heading-less notes with the same file name are an ambiguous title and stay unmatched", async () => {
  const { repo, h, notes } = setup({ "x/README.md": "text\n", "y/README.md": "text\n", "z.md": "# Z\n[[readme]]\n" });
  const idx = await notes();
  const z = idx.notes.find((n) => n.path === "z.md")!;
  expect(z.links).toEqual(["readme"]);
  expect(idx.notes.flatMap((n) => n.backlinks)).toEqual([]);
  const n: VaultNote = await call(h, "GET /api/vault/note", { repo, path: "x/README.md" });
  expect(n.backlinks).toEqual([]);
});

test("a path below a note, as in a.md/b.md, is a 400", async () => {
  const { repo, h } = setup({ "a.md": "# A\n" });
  await expect(call(h, "PUT /api/vault/note", { repo, path: "a.md/b.md", text: "x" })).rejects.toMatchObject({ status: 400 });
  await expect(call(h, "POST /api/vault/append", { repo, path: "a.md/b.md", text: "x", author: "a" })).rejects.toMatchObject({ status: 400 });
});

test("a failed write leaves no .tmp file behind", async () => {
  const { repo, h } = setup({ "d.md/keep": "" });
  // d.md is a directory: the rename onto it fails after the temp file was written.
  await expect(call(h, "PUT /api/vault/note", { repo, path: "d.md", text: "x" })).rejects.toBeTruthy();
  expect(readdirSync(join(repo, "docs/vault"))).toEqual(["d.md"]);
});

test("a # line inside a fenced block is not the title", async () => {
  const { notes } = setup({ "f.md": "```sh\n# not a title\n```\n# Real\n", "g.md": "~~~\n# nope\n~~~\n" });
  const idx = await notes();
  expect(idx.notes.map((n) => n.title)).toEqual(["Real", "g"]);
});
