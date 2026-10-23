import { openCommand } from "./commands/open.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";

const USAGE = "usage: agentboard <start | open [path] | status>";

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
    case "status":
      return statusCommand();
    default:
      console.error(USAGE);
      return 2;
  }
}
