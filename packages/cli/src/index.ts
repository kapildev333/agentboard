import { noteCommand } from "./commands/note.js";
import { openCommand } from "./commands/open.js";
import { spawnCommand } from "./commands/spawn.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";

const USAGE = "usage: agentboard <start | open [path] | status | spawn <agent> | note <text>>";

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  // Later lanes add `mcp`, `spawn`, `note` and `status --json` as further cases.
  switch (cmd) {
    case "start":
      await startCommand();
      return 0;
    case "open":
      await openCommand(rest);
      return 0;
    case "note":
      return noteCommand(rest);
    case "spawn":
      return spawnCommand(rest);
    case "status":
      return statusCommand(rest);
    default:
      console.error(USAGE);
      return 2;
  }
}
