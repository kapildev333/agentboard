import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
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
  let fence = "";
  let heading: string | undefined;
  for (const line of text.split("\n")) {
    const f = /^ {0,3}(```|~~~)/.exec(line)?.[1];
    if (f) fence = fence === "" ? f : fence === f ? "" : fence;
    else if (!fence) {
      heading = /^# +(.+?) *$/.exec(line)?.[1];
      if (heading) break;
    }
  }
  const raw = [...text.matchAll(WIKILINK)].map((m) => ({ target: m[1]!.trim(), at: m.index! }));
  const slash = path.indexOf("/");
  return { path, title: heading ?? basename(path, ".md"), folder: slash < 0 ? "" : path.slice(0, slash), mtime, text, raw };
}

async function walk(dir: string, rel = ""): Promise<{ path: string; abs: string; mtime: number }[]> {
  let entries;
  try { entries = await readdir(join(dir, rel), { withFileTypes: true }); } catch { return []; }
  const out: { path: string; abs: string; mtime: number }[] = [];
  for (const e of entries) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(dir, p));
    else if (e.isFile() && e.name.endsWith(".md")) out.push({ path: p, abs: join(dir, p), mtime: (await stat(join(dir, p))).mtimeMs });
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
    const files = await walk(root);
    const stamp = files.map((f) => `${f.path}:${f.mtime}`).join("\n");
    const hit = caches.get(root);
    if (hit?.stamp === stamp) return hit.notes;
    // ponytail: reads are sequential, so a huge vault costs one pass in series; batch if that ever shows.
    const notes: Parsed[] = [];
    for (const f of files) notes.push(parse(f.path, await readFile(f.abs, "utf8"), f.mtime));
    caches.set(root, { stamp, notes });
    return notes;
  }

  /** Title to its note; a title shared by two notes is ambiguous and maps to nothing. */
  function byTitle(notes: Parsed[]) {
    const all = new Map<string, Parsed[]>();
    for (const n of notes) all.set(n.title.toLowerCase(), [...(all.get(n.title.toLowerCase()) ?? []), n]);
    return new Map([...all].filter(([, l]) => l.length === 1).map(([t, l]) => [t, l[0]!]));
  }

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

  /** The canonical vault-relative path and absolute file for a path; `..`, absolute and non-.md paths are refused. */
  async function fileOf(repo: string, given: string): Promise<{ path: string; abs: string }> {
    const bad = () => new HttpError(400, `not a vault note path: ${given}`);
    if (typeof given !== "string" || !given.endsWith(".md") || given.includes("\0") || given.includes("\\") || posix.isAbsolute(given) || given.split("/").includes("..")) throw bad();
    // A leading docs/vault/ names the vault root, so it is dropped rather than nested.
    const path = posix.normalize(given).replace(/^(\.\/)+/, "").replace(/^docs\/vault\//, "");
    if (path.startsWith("../") || !path.endsWith(".md")) throw bad();
    const root = await rootOf(repo);
    const abs = resolve(root, path);
    if (!abs.startsWith(root + sep)) throw bad();
    // Resolve the nearest existing ancestor, so a symlinked folder is caught before a new note is written under it.
    let near = abs;
    while (!(await realpath(near).then(() => true, () => false))) near = dirname(near);
    if (near !== abs && !(await stat(near)).isDirectory()) throw bad();
    const real = join(await realpath(near), relative(near, abs));
    if (!real.startsWith(join(await realpath(await repoOf(repo)), ROOT) + sep)) throw bad();
    return { path, abs };
  }

  async function save(abs: string, text: string) {
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, text);
      await rename(tmp, abs);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
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
    "GET /api/vault/note": async ({ repo, path }: { repo: string; path: string }) => detail(repo, (await fileOf(repo, path)).path),
    "PUT /api/vault/note": async ({ repo, path, text, mtime }: { repo: string; path: string; text: string; mtime?: number }) => {
      const f = await fileOf(repo, path);
      const current = await stat(f.abs).then((s) => s.mtimeMs, () => undefined);
      if (mtime !== undefined && current !== undefined && current !== mtime) throw new HttpError(409, "the note changed on disk since it was read");
      await save(f.abs, text);
      return detail(repo, f.path);
    },
    "POST /api/vault/append": async ({ repo, path, text, author }: { repo: string; path: string; text: string; author: string }) => {
      const f = await fileOf(repo, path);
      await mkdir(dirname(f.abs), { recursive: true });
      // One O_APPEND write, so concurrent appends both land.
      await appendFile(f.abs, `\n\n<!-- agentboard: by ${author} at ${new Date().toISOString()} -->\n${text}\n`);
      return detail(repo, f.path);
    },
  };
}
