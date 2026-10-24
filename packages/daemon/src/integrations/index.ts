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

const SIZE = 100;

export class CallLog {
  private ring: CallLogEntry[] = [];
  private seen: Integrations["seen"] = {};

  record(call: Call): void {
    const entry: CallLogEntry = {
      at: new Date().toISOString(),
      source: "unknown",
      route: call.route,
      result: call.reason ? `${call.status} ${call.reason}` : String(call.status),
      ...(call.origin !== undefined && { origin: call.origin }),
    };
    this.ring.push(entry);
    if (this.ring.length > SIZE) this.ring.shift();
  }

  /** Newest first. */
  read(): Integrations {
    return { seen: { ...this.seen }, log: this.ring.toReversed() };
  }
}
