import { execFile, execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { createFileHandlers } from "../../src/files/index.js";

const run = promisify(execFile);
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "ab-files-"));
  git(repo, "init", "-b", "main");
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\nexport const b = 2;\n");
  writeFileSync(join(repo, "README.md"), "# hi\n");
  writeFileSync(join(repo, ".gitignore"), "dist/\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "init");
  return repo;
}

function handlers(repo: string) {
  return createFileHandlers({
    repoOf: async () => repo,
    git: async (cmd, args, o) => (await run(cmd, args, o)).stdout,
  });
}
const status = async (p: Promise<unknown>) => p.then(() => 0, (e: { status?: number }) => e.status ?? -1);

test("a path with .. is refused with 400", async () => {
  const h = handlers(makeRepo());
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "../x" }, {}))).toBe(400);
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "src/../../x" }, {}))).toBe(400);
});

test("an absolute path is refused with 400", async () => {
  const h = handlers(makeRepo());
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "/etc/passwd" }, {}))).toBe(400);
});

test("anything inside .git is refused", async () => {
  const h = handlers(makeRepo());
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: ".git/HEAD" }, {}))).toBe(400);
  expect(await status(h["PUT /api/files/write"]({ repo: "r", path: ".git/hooks/x", text: "x" }, {}))).toBe(400);
});

test("a symlink that leaves the repository is refused", async () => {
  const repo = makeRepo();
  symlinkSync("/etc", join(repo, "etc-link"));
  symlinkSync("/etc/hosts", join(repo, "hosts-link"));
  const h = handlers(repo);
  expect(await status(h["GET /api/files"]({ repo: "r", path: "etc-link" }, {}))).toBe(400);
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "etc-link/hosts" }, {}))).toBe(400);
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "hosts-link" }, {}))).toBe(400);
  expect(await status(h["PUT /api/files/write"]({ repo: "r", path: "etc-link/x", text: "x" }, {}))).toBe(400);
});

test("the tree lists one directory, dirs first, skipping .git and ignored paths, with statuses", async () => {
  const repo = makeRepo();
  mkdirSync(join(repo, "dist"));
  writeFileSync(join(repo, "dist", "o.js"), "x");
  writeFileSync(join(repo, "README.md"), "# changed\n");
  writeFileSync(join(repo, "new.txt"), "n");
  const h = handlers(repo);
  const root = await h["GET /api/files"]({ repo: "r" }, {});
  expect(root.path).toBe("");
  expect(root.entries).toEqual([
    { name: "src", path: "src", kind: "dir" },
    { name: ".gitignore", path: ".gitignore", kind: "file" },
    { name: "new.txt", path: "new.txt", kind: "file", status: "?" },
    { name: "README.md", path: "README.md", kind: "file", status: "M" },
  ]);
  const src = await h["GET /api/files"]({ repo: "r", path: "src" }, {});
  expect(src.entries).toEqual([{ name: "a.ts", path: "src/a.ts", kind: "file" }]);
});

test("a directory with a changed file carries a status", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "src", "a.ts"), "changed\n");
  const root = await handlers(repo)["GET /api/files"]({ repo: "r" }, {});
  expect(root.entries[0]).toEqual({ name: "src", path: "src", kind: "dir", status: "M" });
});

test("in a daemon worktree the status is against its base branch", async () => {
  const repo = makeRepo();
  const wt = join(repo, ".worktrees", "feat");
  git(repo, "worktree", "add", "-b", "feat", wt, "main");
  const file = git(wt, "rev-parse", "--path-format=absolute", "--git-path", "agentboard-base");
  writeFileSync(file, "refs/heads/main\n");
  writeFileSync(join(wt, "c.txt"), "c");
  git(wt, "add", ".");
  git(wt, "commit", "-m", "c");
  const tree = await handlers(wt)["GET /api/files"]({ repo: "r" }, {});
  expect(tree.entries.find((e) => e.name === "c.txt")?.status).toBe("A");
});

test("read returns text, lines and language", async () => {
  const r = await handlers(makeRepo())["GET /api/files/read"]({ repo: "r", path: "src/a.ts" }, {});
  expect(r).toEqual({ path: "src/a.ts", size: 40, lines: 2, text: "export const a = 1;\nexport const b = 2;\n", language: "ts" });
});

test("a 2 MB file reads as text: null with its size", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "big.txt"), "a".repeat(2 * 1024 * 1024));
  const r = await handlers(repo)["GET /api/files/read"]({ repo: "r", path: "big.txt" }, {});
  expect(r).toMatchObject({ size: 2 * 1024 * 1024, text: null, language: "text" });
});

test("a file with a NUL byte in its first 8 KB reads as text: null", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "b.bin"), Buffer.from([1, 0, 2]));
  expect(await handlers(repo)["GET /api/files/read"]({ repo: "r", path: "b.bin" }, {})).toMatchObject({ size: 3, text: null });
});

test("a missing file is 404", async () => {
  expect(await status(handlers(makeRepo())["GET /api/files/read"]({ repo: "r", path: "nope.ts" }, {}))).toBe(404);
});

test("write replaces atomically, creates parents, leaves no temp file", async () => {
  const repo = makeRepo();
  const h = handlers(repo);
  expect(await h["PUT /api/files/write"]({ repo: "r", path: "src/a.ts", text: "new\n" }, {})).toEqual({ ok: true });
  expect(readFileSync(join(repo, "src", "a.ts"), "utf8")).toBe("new\n");
  await h["PUT /api/files/write"]({ repo: "r", path: "docs/deep/n.md", text: "# n" }, {});
  expect(readFileSync(join(repo, "docs", "deep", "n.md"), "utf8")).toBe("# n");
  expect(readdirSync(join(repo, "docs", "deep"))).toEqual(["n.md"]);
});

test("write refuses a binary target and a directory", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "b.bin"), Buffer.from([0, 1]));
  const h = handlers(repo);
  expect(await status(h["PUT /api/files/write"]({ repo: "r", path: "b.bin", text: "x" }, {}))).toBe(400);
  expect(await status(h["PUT /api/files/write"]({ repo: "r", path: "src", text: "x" }, {}))).toBe(400);
});

test("write keeps the mode of the file it replaces", async () => {
  const repo = makeRepo();
  chmodSync(join(repo, "src", "a.ts"), 0o755);
  await handlers(repo)["PUT /api/files/write"]({ repo: "r", path: "src/a.ts", text: "x" }, {});
  expect(statSync(join(repo, "src", "a.ts")).mode & 0o777).toBe(0o755);
});

test("write through a symlink inside the repository updates the target and keeps the link", async () => {
  const repo = makeRepo();
  symlinkSync("a.ts", join(repo, "src", "link.ts"));
  await handlers(repo)["PUT /api/files/write"]({ repo: "r", path: "src/link.ts", text: "via link\n" }, {});
  expect(lstatSync(join(repo, "src", "link.ts")).isSymbolicLink()).toBe(true);
  expect(readFileSync(join(repo, "src", "a.ts"), "utf8")).toBe("via link\n");
});

test("a file name with a space and a rename carry statuses", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "my file.txt"), "n");
  git(repo, "mv", "README.md", "READ ME.md");
  const entries = (await handlers(repo)["GET /api/files"]({ repo: "r" }, {})).entries;
  expect(entries.find((e) => e.name === "my file.txt")?.status).toBe("?");
  expect(entries.find((e) => e.name === "READ ME.md")?.status).toBe("M");
});

test("a path that normalises to a legal one is still refused for its ..", async () => {
  const h = handlers(makeRepo());
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: "src/../src/a.ts" }, {}))).toBe(400);
});

test("a .git spelled in another case is refused", async () => {
  const h = handlers(makeRepo());
  expect(await status(h["GET /api/files/read"]({ repo: "r", path: ".GIT/HEAD" }, {}))).toBe(400);
});
