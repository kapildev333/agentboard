import { createHash } from "node:crypto";
import { join } from "node:path";
import { agentboardHome, daemonFilePath } from "@agentboard/shared";

// One definition for the daemon, CLI and MCP (L10 follow-up): the shared one reads process.env per call.
export { agentboardHome, daemonFilePath };
export const boardPath = (repoPath: string): string =>
  join(agentboardHome(), "boards", `${createHash("sha1").update(repoPath).digest("hex")}.json`);
