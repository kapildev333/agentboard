import type { CallLogEntry, Integrations } from "@agentboard/shared";

/** One request as the server saw it: what was asked and how it was answered, never a token, header or body. */
export type Call = {
  /** "POST /api/consoles": the route pattern, or the bare path when no route matched. */
  route: string;
  status: number;
  /** Why the server refused it ("bad Origin"); unset for an accepted request. */
  reason?: string;
  /** The Origin header's value on a refused request (the Host value on a Host refusal). */
  origin?: string;
  /** The x-agentboard-client header. */
  client?: string;
  /** The caller proved it is the board page (cookie session, checked Origin). */
  board: boolean;
  params: Record<string, string>;
};

type Seen = keyof Integrations["seen"];
export type ConsoleOf = (id: string) => { title: string; agent: string } | undefined;

const SIZE = 100;
const HOOK = "POST /hook/:consoleId";
// The values the CLI, the MCP server and the plugins send; the board page sends a per-tab id instead.
const CLIENTS: Record<string, { source: string; seen: Seen }> = {
  cli: { source: "cli", seen: "command" },
  mcp: { source: "mcp", seen: "mcp" },
  "claude-plugin": { source: "plugin", seen: "claudePlugin" },
  "opencode-plugin": { source: "plugin", seen: "opencodePlugin" },
};

export class CallLog {
  private ring: CallLogEntry[] = [];
  private seen: Integrations["seen"] = {};

  constructor(private consoleOf: ConsoleOf = () => undefined) {}

  record(call: Call): void {
    const known = call.client && Object.hasOwn(CLIENTS, call.client) ? CLIENTS[call.client] : undefined;
    // Only an accepted hook names its console: a refused caller could put any id in the path.
    const target = call.route === HOOK && !call.reason && call.params.consoleId ? this.consoleOf(call.params.consoleId) : undefined;
    // The daemon loads the OpenCode plugin into every opencode console, so their hooks are the plugin's. A claude
    // console's hooks come from the daemon's own relay unless the plugin says it sent them.
    const seen = known?.seen ?? (target?.agent === "opencode" ? "opencodePlugin" : undefined);
    const at = new Date().toISOString();
    if (seen && !call.reason) this.seen[seen] = at;
    const entry: CallLogEntry = {
      at,
      source: target?.title ?? known?.source ?? (call.board ? "board" : "unknown"),
      route: call.route,
      result: call.reason ? `${call.status} ${call.reason}` : String(call.status),
      ...(call.origin !== undefined && { origin: call.origin }),
    };
    this.ring.push(entry);
    if (this.ring.length > SIZE) this.ring.shift();
  }

  /** Newest first. */
  read(): Integrations {
    return { seen: { ...this.seen }, log: [...this.ring].reverse() };
  }
}
