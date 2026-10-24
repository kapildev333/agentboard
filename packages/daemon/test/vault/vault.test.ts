import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createVaultHandlers } from "../../src/vault/index.js";

// Handlers are typed by the route table once L60 lands; the tests only read fields off JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup(notes: Record<string, string>) {
  const repo = mkdtempSync(join(tmpdir(), "agentboard-vault-"));
  dirs.push(repo);
  for (const [p, text] of Object.entries(notes)) {
    mkdirSync(dirname(join(repo, "docs/vault", p)), { recursive: true });
    writeFileSync(join(repo, "docs/vault", p), text);
  }
  const h = createVaultHandlers({ repoOf: (r) => r });
  return { repo, h, notes: () => h["GET /api/vault/notes"]!({ repo }) as Promise<Json> };
}

test("three notes with links produce the expected links and backlinks", async () => {
  const { notes } = setup({
    "a.md": "# Alpha\nsee [[Beta]] and [[Nowhere]]\n",
    "b.md": "# Beta\nback to [[alpha]]\n",
    "sub/c.md": "no heading here, links [[Alpha]]\n",
  });
  const idx = await notes();
  expect(idx.root).toBe("docs/vault");
  const by = Object.fromEntries(idx.notes.map((n: Json) => [n.path, n]));
  expect(by["a.md"]).toMatchObject({ title: "Alpha", folder: "", links: ["Beta", "Nowhere"] });
  expect(by["a.md"].backlinks).toEqual(["b.md", "sub/c.md"]);
  expect(by["b.md"].backlinks).toEqual(["a.md"]);
  expect(by["sub/c.md"]).toMatchObject({ title: "c", folder: "sub", links: ["Alpha"], backlinks: [] });
});

const call = (h: Json, key: string, arg: object) => h[key](arg, {}, undefined);

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
  for (const [key, arg] of [["GET /api/vault/note", {}], ["PUT /api/vault/note", { text: "x" }], ["POST /api/vault/append", { text: "x", author: "a" }]] as const) {
    await expect(call(h, key, { repo, path, ...arg })).rejects.toMatchObject({ status: 400 });
  }
});
