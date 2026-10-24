import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { GitService, createGitHandlers } from "../../src/git/index.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "ab-wr-"));
  git(repo, "init", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "init");
  return repo;
}

const handlers = () => createGitHandlers(new GitService({ exec: async () => "" }));

test("removes a clean worktree and deletes its branch", async () => {
  const repo = makeRepo();
  const h = handlers();
  const { path, branch } = await h.worktree({ repo, name: "clean", base: "main" });
  expect(await h.worktreeRemove({ repo, path, branch, deleteBranch: true, force: false })).toEqual({ ok: true });
  expect(existsSync(path)).toBe(false);
  expect(git(repo, "branch", "--list", branch)).toBe("");
});

test("refuses a dirty worktree without force and removes it with force", async () => {
  const repo = makeRepo();
  const h = handlers();
  const { path, branch } = await h.worktree({ repo, name: "dirty", base: "main" });
  writeFileSync(join(path, "a.txt"), "changed\n");
  await expect(h.worktreeRemove({ repo, path, branch, deleteBranch: true, force: false })).rejects.toMatchObject({ code: "dirty", status: 409 });
  expect(existsSync(path)).toBe(true);
  expect(git(repo, "branch", "--list", branch)).toContain(branch);
  await h.worktreeRemove({ repo, path, branch, deleteBranch: true, force: true });
  expect(existsSync(path)).toBe(false);
  expect(git(repo, "branch", "--list", branch)).toBe("");
});

test("refuses a path outside the repo's .worktrees folder", async () => {
  const repo = makeRepo();
  const h = handlers();
  const { branch } = await h.worktree({ repo, name: "w", base: "main" });
  const outside = [repo, join(repo, ".worktrees"), join(repo, ".worktrees", "w", ".."), mkdtempSync(join(tmpdir(), "ab-out-")), join(repo, ".worktrees", "missing")];
  for (const path of outside)
    await expect(h.worktreeRemove({ repo, path, branch, deleteBranch: true, force: true })).rejects.toMatchObject({ code: "outside", status: 400 });
  expect(git(repo, "branch", "--list", branch)).toContain(branch);
});
