import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createVaultHandlers } from "../../src/vault/index.js";

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
  return { repo, h, notes: () => h["GET /api/vault/notes"]!({ repo }, {}, undefined as never) as Promise<any> };
}

test("three notes with links produce the expected links and backlinks", async () => {
  const { notes } = setup({
    "a.md": "# Alpha\nsee [[Beta]] and [[Nowhere]]\n",
    "b.md": "# Beta\nback to [[alpha]]\n",
    "sub/c.md": "no heading here, links [[Alpha]]\n",
  });
  const idx = await notes();
  expect(idx.root).toBe("docs/vault");
  const by = Object.fromEntries(idx.notes.map((n: any) => [n.path, n]));
  expect(by["a.md"]).toMatchObject({ title: "Alpha", folder: "", links: ["Beta", "Nowhere"] });
  expect(by["a.md"].backlinks).toEqual(["b.md", "sub/c.md"]);
  expect(by["b.md"].backlinks).toEqual(["a.md"]);
  expect(by["sub/c.md"]).toMatchObject({ title: "c", folder: "sub", links: ["Alpha"], backlinks: [] });
});
