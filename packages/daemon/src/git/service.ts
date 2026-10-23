import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleGit } from "simple-git";

export type GitErrorCode = "dirty" | "unpushed";

export class GitError extends Error {
  constructor(
    public code: GitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export type Exec = (cmd: string, args: string[], opts: { cwd: string }) => Promise<string>;

export class GitService {
  constructor(private deps: { exec: Exec }) {}

  async worktreeAdd(repoPath: string, name: string, base: string) {
    const path = join(repoPath, ".worktrees", name);
    await simpleGit(repoPath).raw(["worktree", "add", "-b", name, path, base]);
    const exclude = join(repoPath, ".git", "info", "exclude");
    const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
    if (!current.split("\n").includes(".worktrees/")) appendFileSync(exclude, `${current && !current.endsWith("\n") ? "\n" : ""}.worktrees/\n`);
    return { path, branch: name };
  }
}
