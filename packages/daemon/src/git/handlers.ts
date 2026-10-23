import {
  CommitRequestSchema,
  GitPathQuerySchema,
  PrRequestSchema,
  PushRequestSchema,
  WorktreeRequestSchema,
} from "@agentboard/shared";
import type { GitService } from "./service.js";

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
