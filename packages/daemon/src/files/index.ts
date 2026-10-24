import { randomBytes } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile, readdir, rm } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import type { Exec } from "../git/index.js";
import type { RouteHandlers } from "../server/index.js";
import { HttpError } from "./http-error.js";

export type FileDeps = {
  /** The loaded board's repository for a request's `repo`; throws when the daemon has none. */
  repoOf: (repo: string) => Promise<string>;
  /** Runs git (or any command) in a directory and answers its stdout. */
  git: Exec;
};
type FileRoutes = Required<Pick<RouteHandlers, "GET /api/files" | "GET /api/files/read" | "PUT /api/files/write">>;

const MAX_TEXT = 1024 * 1024;
const SNIFF = 8192;
const LANGUAGES: Record<string, string> = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".json": "json", ".md": "md", ".css": "css", ".html": "html",
  ".sh": "sh", ".py": "py", ".go": "go", ".rs": "rs", ".yaml": "yaml", ".yml": "yaml",
};

/** Resolves a repository-relative path to an absolute one, or throws 400 when it could leave the repository or touch .git. */
async function resolveIn(repo: string, rel: string): Promise<string> {
  if (rel.includes("\0") || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new HttpError(400, "invalid path");
  const parts = rel.split(/[\\/]/).filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".." || p === ".git")) throw new HttpError(400, "invalid path");
  const root = await realpath(repo);
  const abs = join(root, ...parts);
  // The deepest existing ancestor (a symlink counts as existing) must really live inside the repository, outside .git.
  let probe = abs;
  for (;;) {
    try {
      await lstat(probe);
      break;
    } catch {
      probe = dirname(probe);
    }
  }
  let real: string;
  try {
    real = await realpath(probe);
  } catch {
    throw new HttpError(400, "invalid path"); // dangling symlink
  }
  const inside = relative(root, real);
  if (inside.startsWith("..") || isAbsolute(inside) || inside.split(sep)[0] === ".git") throw new HttpError(400, "path leaves the repository");
  return abs;
}

function sniffBinary(abs: string): boolean {
  const fd = openSync(abs, "r");
  try {
    const buf = Buffer.alloc(SNIFF);
    return buf.subarray(0, readSync(fd, buf, 0, SNIFF, 0)).includes(0);
  } finally {
    closeSync(fd);
  }
}

const notFound = (err: unknown) => {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "not found");
  throw err;
};

export function createFileHandlers({ repoOf, git }: FileDeps): FileRoutes {
  const tryGit = (cwd: string, args: string[]) => git("git", ["-c", "core.quotepath=off", ...args], { cwd }).catch(() => "");

  /** Change status per path: against the base branch when the daemon made this worktree, else against HEAD. */
  async function changes(cwd: string): Promise<Map<string, "M" | "A" | "D" | "?">> {
    const file = (await tryGit(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "agentboard-base"])).trim();
    const base = file ? await readFile(file, "utf8").then((s) => s.trim(), () => "") : "";
    const rev = (base && (await tryGit(cwd, ["merge-base", base, "HEAD"])).trim()) || "HEAD";
    const out = new Map<string, "M" | "A" | "D" | "?">();
    for (const line of (await tryGit(cwd, ["diff", "--name-status", rev])).split("\n").filter(Boolean)) {
      const [code, ...paths] = line.split("\t");
      out.set(paths[paths.length - 1], code[0] === "A" ? "A" : code[0] === "D" ? "D" : "M");
    }
    for (const line of (await tryGit(cwd, ["status", "--porcelain", "--untracked-files=all"])).split("\n")) {
      if (line.startsWith("??")) out.set(line.slice(3), "?");
      else if (line.startsWith("A ") && !out.has(line.slice(3))) out.set(line.slice(3), "A");
    }
    return out;
  }

  return {
    async "GET /api/files"({ repo, path = "" }) {
      const cwd = await repoOf(repo);
      const abs = await resolveIn(cwd, path);
      const dir = relative(await realpath(cwd), abs).split(sep).join("/");
      const [names, changed, ignoredOut] = await Promise.all([
        readdir(abs, { withFileTypes: true }).catch(notFound),
        changes(cwd),
        tryGit(cwd, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"]),
      ]);
      const ignored = new Set(ignoredOut.split("\n").filter(Boolean).map((p) => p.replace(/\/$/, "")));
      const entries = [];
      for (const d of names) {
        const p = dir ? `${dir}/${d.name}` : d.name;
        if (d.name === ".git" || ignored.has(p)) continue;
        const isDir = d.isDirectory() || (d.isSymbolicLink() && (await stat(join(abs, d.name)).catch(() => null))?.isDirectory());
        let status = changed.get(p);
        if (isDir && !status) for (const k of changed.keys()) if (k.startsWith(`${p}/`)) status = "M";
        entries.push({ name: d.name, path: p, kind: isDir ? ("dir" as const) : ("file" as const), ...(status && { status }) });
      }
      entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "dir" ? -1 : 1) || a.name.localeCompare(b.name));
      return { path: dir, entries };
    },

    async "GET /api/files/read"({ repo, path = "" }) {
      const abs = await resolveIn(await repoOf(repo), path);
      const info = await stat(abs).catch(notFound);
      if (!info.isFile()) throw new HttpError(400, "not a file");
      const language = LANGUAGES[extname(abs).toLowerCase()] ?? "text";
      if (info.size > MAX_TEXT || sniffBinary(abs)) return { path, size: info.size, lines: 0, text: null, language };
      const text = await readFile(abs, "utf8");
      const lines = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
      return { path, size: info.size, lines, text, language };
    },

    async "PUT /api/files/write"({ repo, path, text }) {
      const abs = await resolveIn(await repoOf(repo), path);
      if (abs === (await realpath(await repoOf(repo)))) throw new HttpError(400, "invalid path");
      const info = await stat(abs).catch(() => null);
      if (info && !info.isFile()) throw new HttpError(400, "not a file");
      if (info && sniffBinary(abs)) throw new HttpError(400, "binary file");
      await mkdir(dirname(abs), { recursive: true });
      const tmp = join(dirname(abs), `.${randomBytes(6).toString("hex")}.tmp`);
      try {
        await writeFile(tmp, text);
        await rename(tmp, abs);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      return { ok: true as const };
    },
  };
}
