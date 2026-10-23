// The slice of the ws API this package uses; the brief allows ws and no @types/ws.
declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export default class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    constructor(url: string, options?: { headers?: Record<string, string> });
    send(data: string): void;
    close(): void;
    terminate(): void;
    on(event: "open" | "close", listener: () => void): this;
    on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "unexpected-response", listener: (req: unknown, res: IncomingMessage) => void): this;
  }

  export class WebSocketServer {
    readonly clients: Set<WebSocket>;
    constructor(options: { noServer: true; maxPayload?: number });
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, cb: (ws: WebSocket) => void): void;
    close(): void;
  }
}
