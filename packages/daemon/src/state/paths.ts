import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const agentboardHome = (): string => process.env.AGENTBOARD_HOME || join(homedir(), ".agentboard");
export const boardPath = (repoPath: string): string =>
  join(agentboardHome(), "boards", `${createHash("sha1").update(repoPath).digest("hex")}.json`);
export const daemonFilePath = (): string => join(agentboardHome(), "daemon.json");
