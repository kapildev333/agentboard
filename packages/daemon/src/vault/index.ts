import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import type { VaultNote } from "@agentboard/shared";
import { HttpError } from "../files/http-error.js";
import type { RouteHandlers } from "../server/index.js";

const ROOT = "docs/vault";
const EXCERPT = 90;

export type VaultDeps = {
  /** The absolute repository path for a `repo` the daemon has loaded; rejects for an unknown one. */
  repoOf(repo: string): Promise<string>;
};

type Parsed = { path: string; title: string; folder: string; mtime: number; text: string; raw: { target: string; at: number }[] };
type Cache = { stamp: string; notes: Parsed[] };

const WIKILINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;

function parse(path: string, text: string, mtime: number): Parsed {
  const heading = /^# +(.+?) *$/m.exec(text);
  const raw = [...text.matchAll(WIKILINK)].map((m) => ({ target: m[1]!.trim(), at: m.index! }));
  const slash = path.indexOf("/");
  return { path, title: heading?.[1] ?? basename(path, ".md"), folder: slash < 0 ? "" : path.slice(0, slash), mtime, text, raw };
}

async function walk(dir: string, rel = ""): Promise<{ path: string; abs: string }[]> {
  let entries;
  try { entries = await readdir(join(dir, rel), { withFileTypes: true }); } catch { return []; }
  const out: { path: string; abs: string }[] = [];
  for (const e of entries) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(dir, p));
    else if (e.isFile() && e.name.endsWith(".md")) out.push({ path: p, abs: join(dir, p) });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

type VaultRoutes = Required<Pick<RouteHandlers, "GET /api/vault/notes" | "GET /api/vault/note" | "PUT /api/vault/note" | "POST /api/vault/append">>;

export function createVaultHandlers({ repoOf }: VaultDeps): VaultRoutes {
  const caches = new Map<string, Cache>();

  const rootOf = async (repo: string) => join(await repoOf(repo), ROOT);

  /** Re-reads every note only when a path or an mtime differs from the cached listing. */
  async function load(repo: string): Promise<Parsed[]> {
    const root = await rootOf(repo);
    const files = await Promise.all((await walk(root)).map(async (f) => ({ ...f, mtime: (await stat(f.abs)).mtimeMs })));
    const stamp = files.map((f) => `${f.path}:${f.mtime}`).join("\n");
    const hit = caches.get(root);
    if (hit?.stamp === stamp) return hit.notes;
    const notes = await Promise.all(files.map(async (f) => parse(f.path, await readFile(f.abs, "utf8"), f.mtime)));
    caches.set(root, { stamp, notes });
    return notes;
  }

  const byTitle = (notes: Parsed[]) => new Map(notes.map((n) => [n.title.toLowerCase(), n]));

  function resolveLinks(n: Parsed, titles: Map<string, Parsed>) {
    const hits = n.raw.map((r) => ({ ...r, note: titles.get(r.target.toLowerCase()) }));
    return { hits, links: [...new Set(hits.map((h) => h.note?.title ?? h.target))] };
  }

  async function detail(repo: string, path: string): Promise<VaultNote> {
    const notes = await load(repo);
    const self = notes.find((n) => n.path === path);
    if (!self) throw new HttpError(404, `no note ${path}`);
    const titles = byTitle(notes);
    const backlinks: VaultNote["backlinks"] = [];
    for (const n of notes) {
      if (n === self) continue;
      const hit = resolveLinks(n, titles).hits.find((h) => h.note === self);
      if (!hit) continue;
      const from = Math.max(0, hit.at - EXCERPT / 2);
      backlinks.push({ path: n.path, title: n.title, excerpt: n.text.slice(from, from + EXCERPT).replace(/\s+/g, " ").trim() });
    }
    return { path, title: self.title, text: self.text, mtime: self.mtime, links: resolveLinks(self, titles).links, backlinks };
  }

  /** The absolute file for a vault-relative path; `..`, absolute and non-.md paths are refused. */
  async function fileOf(repo: string, path: string): Promise<string> {
    if (typeof path !== "string" || !path.endsWith(".md") || path.includes("\0") || path.includes("\\") || posix.isAbsolute(path) || path.split("/").includes("..")) {
      throw new HttpError(400, `not a vault note path: ${path}`);
    }
    const root = await rootOf(repo);
    const abs = resolve(root, path);
    if (!abs.startsWith(root + sep)) throw new HttpError(400, `not a vault note path: ${path}`);
    // Resolve the nearest existing ancestor, so a symlinked folder is caught before a new note is written under it.
    let near = abs;
    while (!(await realpath(near).then(() => true, () => false))) near = dirname(near);
    const real = join(await realpath(near), relative(near, abs));
    if (!real.startsWith(join(await realpath(await repoOf(repo)), ROOT) + sep)) throw new HttpError(400, `not a vault note path: ${path}`);
    return abs;
  }

  async function save(abs: string, text: string) {
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    await writeFile(tmp, text);
    await rename(tmp, abs);
  }

  return {
    "GET /api/vault/notes": async ({ repo }: { repo: string }) => {
      const notes = await load(repo);
      const titles = byTitle(notes);
      const back = new Map<string, string[]>();
      const resolved = notes.map((n) => {
        const { hits, links } = resolveLinks(n, titles);
        for (const t of new Set(hits.map((h) => h.note).filter((x): x is Parsed => !!x && x !== n))) back.set(t.path, [...(back.get(t.path) ?? []), n.path]);
        return { n, links };
      });
      return {
        root: ROOT,
        notes: resolved.map(({ n, links }) => ({ path: n.path, title: n.title, folder: n.folder, mtime: n.mtime, links, backlinks: back.get(n.path) ?? [] })),
      };
    },
    "GET /api/vault/note": async ({ repo, path }: { repo: string; path: string }) => {
      await fileOf(repo, path);
      return detail(repo, path);
    },
    "PUT /api/vault/note": async ({ repo, path, text, mtime }: { repo: string; path: string; text: string; mtime?: number }) => {
      const abs = await fileOf(repo, path);
      const current = await stat(abs).then((s) => s.mtimeMs, () => undefined);
      if (mtime !== undefined && current !== undefined && current !== mtime) throw new HttpError(409, "the note changed on disk since it was read");
      await save(abs, text);
      return detail(repo, path);
    },
    "POST /api/vault/append": async ({ repo, path, text, author }: { repo: string; path: string; text: string; author: string }) => {
      const abs = await fileOf(repo, path);
      const before = await readFile(abs, "utf8").catch(() => "");
      await save(abs, `${before}\n\n<!-- agentboard: by ${author} at ${new Date().toISOString()} -->\n${text}\n`);
      return detail(repo, path);
    },
  };
}
