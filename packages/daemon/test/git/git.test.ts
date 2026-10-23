import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { GitService } from "../../src/git/index.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function tmp(prefix: string) {
  return mkdtempSync(join(tmpdir(), `ab-${prefix}-`));
}

function makeRepo() {
  const repo = tmp("repo");
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "t");
  git(repo, "config", "user.email", "t@example.com");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "init");
  return repo;
}

const svc = () => new GitService({ exec: async () => "" });

test("worktreeAdd creates a branch and a worktree", async () => {
  const repo = makeRepo();
  const { path, branch } = await svc().worktreeAdd(repo, "feat-x", "main");
  expect(branch).toBe("feat-x");
  expect(existsSync(path)).toBe(true);
  expect(git(path, "branch", "--show-current")).toBe("feat-x");
  expect(readFileSync(join(repo, ".git/info/exclude"), "utf8")).toContain(".worktrees/");
});

test("worktreeRemove refuses a dirty worktree and succeeds with force", async () => {
  const repo = makeRepo();
  const { path } = await svc().worktreeAdd(repo, "feat-d", "main");
  writeFileSync(join(path, "a.txt"), "changed\n");
  await expect(svc().worktreeRemove(path, { force: false })).rejects.toMatchObject({ code: "dirty" });
  await svc().worktreeRemove(path, { force: true });
  expect(existsSync(path)).toBe(false);
});

test("worktreeRemove refuses unpushed commits", async () => {
  const repo = makeRepo();
  const remote = tmp("remote");
  git(remote, "init", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
  const { path } = await svc().worktreeAdd(repo, "feat-u", "main");
  git(path, "push", "-u", "origin", "feat-u");
  writeFileSync(join(path, "b.txt"), "b\n");
  git(path, "add", ".");
  git(path, "commit", "-m", "local only");
  await expect(svc().worktreeRemove(path, { force: false })).rejects.toMatchObject({ code: "unpushed" });
  await svc().worktreeRemove(path, { force: true });
  expect(existsSync(path)).toBe(false);
});

test("status counts ahead and behind against the upstream", async () => {
  const repo = makeRepo();
  const remote = tmp("remote");
  git(remote, "init", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
  const other = tmp("other");
  git(other, "clone", remote, ".");
  writeFileSync(join(other, "r.txt"), "r\n");
  git(other, "add", ".");
  git(other, "commit", "-m", "remote work");
  git(other, "push");
  git(repo, "fetch");
  writeFileSync(join(repo, "l.txt"), "l\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "local work");
  writeFileSync(join(repo, "u.txt"), "u\n");
  const s = await svc().status(repo);
  expect(s).toMatchObject({ branch: "main", ahead: 1, behind: 1, dirty: 1 });
  expect(s.lastCommit).toMatchObject({ subject: "local work" });
  expect(s.lastCommit.sha).toMatch(/^[0-9a-f]{40}$/);
});

test("diff lists a changed file and returns a patch", async () => {
  const repo = makeRepo();
  writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
  const d = await svc().diff(repo);
  expect(d.files).toEqual([{ path: "a.txt", status: "M" }]);
  expect(d.patch).toContain("+two");
});

test("commit and push set upstream on first push", async () => {
  const repo = makeRepo();
  const remote = tmp("remote");
  git(remote, "init", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  writeFileSync(join(repo, "c.txt"), "c\n");
  const { sha } = await svc().commit(repo, "add c");
  expect(sha).toBe(git(repo, "rev-parse", "HEAD"));
  await svc().push(repo);
  expect(git(repo, "rev-parse", "--abbrev-ref", "@{u}")).toBe("origin/main");
  expect(git(remote, "rev-parse", "main")).toBe(sha);
});

test("createPr calls gh with the title and body", async () => {
  const calls: [string, string[], string][] = [];
  const s = new GitService({
    exec: async (cmd, args, o) => {
      calls.push([cmd, args, o.cwd]);
      return "https://github.com/o/r/pull/7\n";
    },
  });
  const { url } = await s.createPr("/wt", { title: "T", body: "B" });
  expect(url).toBe("https://github.com/o/r/pull/7");
  expect(calls).toEqual([["gh", ["pr", "create", "--title", "T", "--body", "B"], "/wt"]]);
});

test("worktreeAdd rejects option-like names and bases before any side effect", async () => {
  const repo = makeRepo();
  git(repo, "branch", "other");
  for (const [name, base] of [["-D", "main"], ["-m", "main"], ["ok", "--detach"]]) {
    await expect(svc().worktreeAdd(repo, name, base)).rejects.toThrow(/must not start with '-'/);
  }
  expect(git(repo, "branch", "--format=%(refname:short)").split("\n").sort()).toEqual(["main", "other"]);
  expect(existsSync(join(repo, ".worktrees"))).toBe(false);
});

test("two worktreeAdd calls leave one exclude entry", async () => {
  const repo = makeRepo();
  await svc().worktreeAdd(repo, "one", "main");
  await svc().worktreeAdd(repo, "two", "main");
  const lines = readFileSync(join(repo, ".git/info/exclude"), "utf8").split("\n");
  expect(lines.filter((l) => l === ".worktrees/")).toHaveLength(1);
});

test("worktreeAdd works when the repo path is itself a linked worktree", async () => {
  const repo = makeRepo();
  const { path: linked } = await svc().worktreeAdd(repo, "outer", "main");
  const { path } = await svc().worktreeAdd(linked, "inner", "main");
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(join(repo, ".git/info/exclude"), "utf8")).toContain(".worktrees/");
});

test("worktreeRemove treats a local commit with an origin but no upstream as unpushed", async () => {
  const repo = makeRepo();
  const remote = tmp("remote");
  git(remote, "init", "--bare", "-b", "main");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-u", "origin", "main");
  const { path } = await svc().worktreeAdd(repo, "feat-n", "main");
  writeFileSync(join(path, "n.txt"), "n\n");
  git(path, "add", ".");
  git(path, "commit", "-m", "never pushed");
  await expect(svc().worktreeRemove(path, { force: false })).rejects.toMatchObject({ code: "unpushed" });
});

test("commit throws when there is nothing to commit", async () => {
  const repo = makeRepo();
  await expect(svc().commit(repo, "empty")).rejects.toThrow(/nothing to commit/);
});

test("status and diff work on a repo with no commits", async () => {
  const repo = tmp("empty");
  git(repo, "init", "-b", "main");
  expect(await svc().status(repo)).toMatchObject({ branch: "main", lastCommit: null });
  expect(await svc().diff(repo)).toEqual({ files: [], patch: "" });
});
