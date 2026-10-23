import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { GitStatusSchema, GitDiffSchema, WorktreeSchema } from "@agentboard/shared";
import { GitService, createGitHandlers } from "../../src/git/index.js";

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" });

test("handlers validate input and return the shared response shapes", async () => {
  const repo = mkdtempSync(join(tmpdir(), "ab-h-"));
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "t");
  git(repo, "config", "user.email", "t@example.com");
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "init");
  const h = createGitHandlers(new GitService({ exec: async () => "https://x/pull/1\n" }));

  const wt = WorktreeSchema.parse(await h.worktree({ repo, name: "w", base: "main" }));
  expect(wt).toEqual({ path: join(repo, ".worktrees", "w"), branch: "w", base: "main" });
  writeFileSync(join(wt.path, "a.txt"), "two\n");
  expect(GitStatusSchema.parse(await h.status({ path: wt.path })).dirty).toBe(1);
  expect(GitDiffSchema.parse(await h.diff({ path: wt.path })).files).toHaveLength(1);
  expect(await h.commit({ path: wt.path, message: "m" })).toMatchObject({ sha: expect.any(String) });
  await expect(h.push({ path: wt.path })).rejects.toThrow(); // no origin
  expect(await h.pr({ path: wt.path, title: "t" })).toEqual({ url: "https://x/pull/1" });
  await expect(h.commit({ path: wt.path })).rejects.toThrow();
});
