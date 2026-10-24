import {
  CommitRequestSchema,
  GitPathQuerySchema,
  PrRequestSchema,
  PushRequestSchema,
  WorktreeRemoveRequestSchema,
  WorktreeRequestSchema,
} from "@agentboard/shared";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { GitError, type GitService } from "./service.js";

// "" for a path that does not exist, so it is never inside anything.
const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return "";
  }
};

// Each handler takes the raw query or body and throws a ZodError on bad input; L12 maps errors to HTTP.
export function createGitHandlers(svc: GitService) {
  return {
    async status(query: unknown) {
      const { lastCommit, ...rest } = await svc.status(GitPathQuerySchema.parse(query).path);
      return { ...rest, lastCommit: lastCommit && { sha: lastCommit.sha, subject: lastCommit.subject } };
    },
    async diff(query: unknown) {
      return svc.diff(GitPathQuerySchema.parse(query).path);
    },
    async worktree(body: unknown) {
      const { repo, name, base } = WorktreeRequestSchema.parse(body);
      return { ...(await svc.worktreeAdd(repo, name, base)), base };
    },
    async worktreeRemove(body: unknown) {
      const { repo, path, branch, deleteBranch, force } = WorktreeRemoveRequestSchema.parse(body);
      // Only a folder directly in the repo's .worktrees, compared after symlinks resolve.
      const r = real(repo), p = real(path);
      if (!r || !p || dirname(p) !== join(r, ".worktrees")) throw new GitError("outside", `${path} is not a worktree in ${repo}/.worktrees`);
      await svc.worktreeRemove(p, { force });
      if (deleteBranch) await svc.branchDelete(r, branch);
      return { ok: true as const };
    },
    async commit(body: unknown) {
      const { path, message } = CommitRequestSchema.parse(body);
      return svc.commit(path, message);
    },
    async push(body: unknown) {
      await svc.push(PushRequestSchema.parse(body).path);
      return { ok: true as const };
    },
    async pr(body: unknown) {
      const { path, ...pr } = PrRequestSchema.parse(body);
      return svc.createPr(path, pr);
    },
  };
}
