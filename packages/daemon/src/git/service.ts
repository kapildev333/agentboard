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
    for (const v of [name, base]) if (v.startsWith("-")) throw new Error(`"${v}" must not start with '-'`);
    const path = join(repoPath, ".worktrees", name);
    const g = simpleGit(repoPath);
    await g.raw(["worktree", "add", "-b", name, path, base]);
    // The base lives in the branch config: no upstream is set (it would break hasUnpushed), and status reads it back by path.
    await g.raw(["config", `branch.${name}.agentboardBase`, base]);
    const exclude = (await g.raw(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"])).trim();
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

  async status(path: string) {
    const g = simpleGit(path);
    const st = await g.status();
    const [sha, subject, when] = (await this.hasHead(g))
      ? (await g.raw(["log", "-1", "--format=%H%x00%s%x00%cI"])).trim().split("\0")
      : [];
    const base = await this.baseOf(g);
    const count = async (range: string) => Number((await g.raw(["rev-list", "--count", range])).trim());
    return {
      branch: st.current ?? "HEAD",
      ahead: base ? await count(`${base}..HEAD`) : st.ahead,
      behind: base ? await count(`HEAD..${base}`) : st.behind,
      dirty: st.files.length,
      lastCommit: sha ? { sha, subject, when } : null,
    };
  }

  // ponytail: tracked changes only; untracked files appear after `commit` stages them.
  async diff(path: string) {
    const g = simpleGit(path);
    // Before the first commit, diff against git's well-known empty tree.
    const rev = (await this.hasHead(g)) ? "HEAD" : "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    const files = (await g.raw(["diff", rev, "--name-status"]))
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [status, ...rest] = l.split("\t");
        return { path: rest[rest.length - 1], status: status[0] };
      });
    return { files, patch: await g.raw(["diff", rev]) };
  }

  async commit(path: string, message: string) {
    const g = simpleGit(path);
    await g.add("-A");
    if (!(await g.commit(message)).commit) throw new Error("nothing to commit");
    return { sha: (await g.revparse(["HEAD"])).trim() };
  }

  async push(path: string): Promise<void> {
    await simpleGit(path).raw(["push", "-u", "origin", "HEAD"]);
  }

  async createPr(path: string, pr: { title: string; body?: string }) {
    const out = await this.deps.exec("gh", ["pr", "create", "--title", pr.title, "--body", pr.body ?? ""], { cwd: path });
    return { url: out.trim() };
  }

  private async hasHead(g: SimpleGit): Promise<boolean> {
    // simple-git resolves empty on a silent non-zero exit, so check the output too.
    return g.raw(["rev-parse", "--verify", "-q", "HEAD"]).then((o) => o.trim() !== "", () => false);
  }

  // The base branch recorded by worktreeAdd, or "" for a branch that has none (or whose base was deleted).
  private async baseOf(g: SimpleGit): Promise<string> {
    const branch = (await g.raw(["branch", "--show-current"])).trim();
    if (!branch) return "";
    const base = await g.raw(["config", "--get", `branch.${branch}.agentboardBase`]).then((o) => o.trim(), () => "");
    return base && (await g.raw(["rev-parse", "--verify", "-q", base]).then((o) => o.trim() !== "", () => false)) ? base : "";
  }

  private async hasUnpushed(g: SimpleGit): Promise<boolean> {
    const count = async (...a: string[]) => Number((await g.raw(["rev-list", "--count", ...a])).trim());
    try {
      return (await count("@{u}..HEAD")) > 0;
    } catch {
      // No upstream: unpushed means commits no remote and not the base have, but only if a remote exists to push to.
      const base = await this.baseOf(g);
      return (await g.getRemotes()).length > 0 && (await count("HEAD", "--not", "--remotes", ...(base ? [base] : []))) > 0;
    }
  }
}
