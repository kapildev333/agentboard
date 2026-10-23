import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

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

  async worktreeRemove(path: string, opts: { force: boolean }): Promise<void> {
    const g = simpleGit(path);
    if (!opts.force) {
      if ((await g.status()).files.length) throw new GitError("dirty", "worktree has uncommitted changes");
      if (await this.hasUnpushed(g)) throw new GitError("unpushed", "branch has commits not pushed");
    }
    const common = (await g.raw(["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    await simpleGit(dirname(common)).raw(["worktree", "remove", ...(opts.force ? ["--force"] : []), path]);
  }

  private async hasUnpushed(g: SimpleGit): Promise<boolean> {
    const count = async (...a: string[]) => Number((await g.raw(["rev-list", "--count", ...a])).trim());
    try {
      return (await count("@{u}..HEAD")) > 0;
    } catch {
      // No upstream: unpushed means commits no remote has, but only if a remote exists to push to.
      return (await g.getRemotes()).length > 0 && (await count("HEAD", "--not", "--remotes")) > 0;
    }
  }
}
