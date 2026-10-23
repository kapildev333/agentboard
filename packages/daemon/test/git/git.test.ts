import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { GitService } from "../../src/git/index.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" }).trim();

function tmp(prefix: string) {
  return mkdtempSync(join(tmpdir(), `ab-${prefix}-`));
}

function makeRepo() {
  const repo = tmp("repo");
  git(repo, "init", "-b", "main");
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
