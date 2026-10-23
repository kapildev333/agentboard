import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BoardQuerySchema, SpawnConsoleRequestSchema } from "@agentboard/shared";
import type { DaemonClient } from "./client.js";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });

export function createServer(client: DaemonClient) {
  const server = new McpServer({ name: "agentboard", version: "0.0.0" });

  server.registerTool(
    "open_board",
    {
      description: "Open the AgentBoard board for a git repository and return its workspaces and nodes.",
      inputSchema: BoardQuerySchema.shape,
    },
    async ({ repo }) => text(await client.openBoard(repo)),
  );
  server.registerTool(
    "spawn_console",
    {
      description:
        "Start a new agent console on the board (agent: claude, codex, gemini, opencode or custom) in cwd, optionally in a git worktree and with a first prompt.",
      inputSchema: SpawnConsoleRequestSchema.shape,
    },
    async (args) => text(await client.spawnConsole(args)),
  );
  server.registerTool(
    "list_consoles",
    { description: "List every console on the board with its id, agent, cwd and status." },
    async () => text(await client.listConsoles()),
  );
  server.registerTool(
    "add_note",
    {
      description: "Add a note card with the given text to the active workspace of the board.",
      inputSchema: { text: z.string() },
    },
    async (args) => text(await client.addNote(args)),
  );
  server.registerTool(
    "get_status",
    { description: "Return the daemon's status: all consoles and whether each is working, idle or needs you." },
    async () => text(await client.getStatus()),
  );
  return server;
}

