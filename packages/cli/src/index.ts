#!/usr/bin/env node
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

// Run only as the entry point, so tests can import main.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).then(
    (code) => { if (code) process.exit(code); },
    (e: Error) => { console.error(`agentboard: ${e.message}`); process.exit(1); },
  );
}
