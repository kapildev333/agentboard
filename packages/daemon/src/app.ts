import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SettingsSchema, type AgentId, type Board, type ConsoleNode, type CustomAgent, type Settings, type Workspace } from "@agentboard/shared";
import { AgentCatalog, launchArgs, resumeArgs } from "./agents/index.js";
import { GitService, createGitHandlers } from "./git/index.js";
import { HandoffService, TeamTriggers } from "./handoff/index.js";
import { handleOpen } from "./open/index.js";
import { PtyManager, loginEnv } from "./pty/index.js";
import { createServer, type RouteHandlers } from "./server/index.js";
import { acceptHook, adoptsNextSession, sessionFromHook, sessionIdOf } from "./session.js";
import { DaemonFile, StateStore, agentboardHome } from "./state/index.js";
import { StatusTracker } from "./status/index.js";
import { transcribe } from "./voice/index.js";

export type DaemonOptions = {
  repoPath: string;
  /** AGENTBOARD_HOME for this process; paths read it from the environment. */
  home?: string;
  port?: number;
  /** The PATH agents are found and run from; else AGENTBOARD_AGENT_PATH, else the login shell's PATH. */
  agentPath?: string;
};
export type Daemon = { origin: string; port: number; token: string; close(): Promise<void> };

/** A client error: the server answers its status and message. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const uiDist = fileURLToPath(new URL("../../ui/dist", import.meta.url));
const NAMES: Record<AgentId, string> = { claude: "Claude", codex: "Codex", gemini: "Gemini", opencode: "OpenCode", custom: "Custom" };
const DEFAULT_SETTINGS: Settings = { fontSize: 13, customAgents: [] };
const W = 520, H = 340, GAP = 40, COLUMNS = 3;
const run = promisify(execFile);

const consoles = (b: Board) => b.workspaces.flatMap((w) => w.nodes).filter((n): n is ConsoleNode => n.type === "console");

// EPERM: the pid exists but belongs to someone else, which still means it answers.
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  if (opts.home) process.env.AGENTBOARD_HOME = opts.home;
  const daemonFile = new DaemonFile();
  const other = await daemonFile.read().catch(() => null);
  // ponytail: a recycled pid also answers; the owner then removes a stale daemon.json by hand
  if (other && alive(other.pid)) throw new Error(`a daemon is already running (pid ${other.pid}, port ${other.port})`);

  const env = await loginEnv();
  // Every entry point (the bin, `agentboard start`, tests) narrows the agent PATH the same way (D38).
  const agentPath = opts.agentPath ?? (process.env.AGENTBOARD_AGENT_PATH || env.PATH) ?? "";
  const token = randomBytes(32).toString("base64url");
  const store = new StateStore();
  const pty = new PtyManager();
  const tracker = new StatusTracker();
  const git = createGitHandlers(new GitService({ exec: async (cmd, args, o) => (await run(cmd, args, o)).stdout }));
  const boards = new Map<string, Board>();
  const loading = new Map<string, Promise<Board>>();
  const running = new Set<string>();
  const adopting = new Set<string>(); // consoles waiting for their next session id (D39)
  const settingsFile = () => join(agentboardHome(), "settings.json");

  const loadBoard = (repo: string): Promise<Board> => {
    const ready = boards.get(repo);
    if (ready) return Promise.resolve(ready);
    let b = loading.get(repo);
    if (!b) {
      b = store.load(repo).then((board) => {
        // Nothing runs for a board read from disk: every console shows stopped until resumed (F1.6, L10).
        for (const n of consoles(board)) n.status = "stopped";
        board.rev ??= 0; // so every client that reads the board carries a rev back
        boards.set(repo, board);
        return board;
      });
      loading.set(repo, b);
      void b.catch(() => {}).finally(() => loading.delete(repo));
    }
    return b;
  };
  const find = (id: string) => {
    for (const board of boards.values())
      for (const ws of board.workspaces) {
        const node = ws.nodes.find((n): n is ConsoleNode => n.type === "console" && n.id === id);
        if (node) return { board, ws, node };
      }
    return undefined;
  };
  const mustFind = (id: string) => {
    const f = find(id);
    if (!f) throw new HttpError(404, `no console ${id}`);
    return f;
  };
  // The board for a cwd: the loaded repo that contains it, else the cwd itself.
  const repoFor = (cwd: string) =>
    [...boards.keys()].filter((r) => cwd === r || cwd.startsWith(r + sep)).sort((a, b) => b.length - a.length)[0] ?? cwd;
  const changed = (board: Board) => {
    void store.save(board);
    server.broadcast({ t: "board", board });
  };

  const settings = async (): Promise<Settings> => {
    try {
      return SettingsSchema.parse(JSON.parse(await readFile(settingsFile(), "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_SETTINGS;
      throw e;
    }
  };
  const customFor = async (customId: string | undefined) => {
    if (!customId) throw new HttpError(400, "custom agents need a customId");
    const custom = (await settings()).customAgents.find((c) => c.id === customId);
    if (!custom) throw new HttpError(400, `unknown custom agent: ${customId}`);
    return custom;
  };

  // Everything that can refuse a launch, checked before any side effect such as a worktree.
  const prepare = (node: ConsoleNode, custom: CustomAgent | undefined, resume: boolean, prompt?: string) => {
    const ctx = { consoleId: node.id, sessionId: node.session?.id ?? "", daemonUrl: origin, token, name: node.title, prompt, custom };
    const l = resume && node.session ? resumeArgs(node.agent, node.session.id, ctx) : launchArgs(node.agent, ctx);
    // Run the file the catalog listed, found on the agent PATH, never whatever the login PATH holds (D38).
    const file = node.agent === "custom" ? l.command : AgentCatalog.resolve(l.command, agentPath);
    if (!file) throw new HttpError(400, `${l.command} is not on the agent PATH`);
    let needsYou: RegExp[] | undefined;
    try {
      needsYou = custom?.needsYou ? [new RegExp(custom.needsYou)] : undefined;
    } catch {
      throw new HttpError(400, `invalid needs-you rule for ${custom!.name}`);
    }
    return { l, file, needsYou };
  };
  const start = (node: ConsoleNode, { l, file, needsYou }: ReturnType<typeof prepare>) => {
    tracker.markStarting(node.id, node.agent, { needsYou });
    try {
      pty.spawn({ id: node.id, command: file, args: l.args, cwd: node.cwd, env: { ...env, ...l.env }, cols: 80, rows: 24 });
    } catch (e) {
      tracker.markExit(node.id);
      throw new HttpError(400, `could not start ${l.command}: ${(e as Error).message}`);
    }
    running.add(node.id);
    if (node.agent !== "custom") void AgentCatalog.readVersion(l.command, { path: agentPath });
    pty.onData(node.id, (data) => {
      tracker.markOutput(node.id, data);
      server.broadcast({ t: "output", consoleId: node.id, data });
    });
    pty.onExit(node.id, (code) => {
      running.delete(node.id);
      adopting.delete(node.id); // a Resume starts with its recorded session, not an open adoption (D39)
      tracker.markExit(node.id, code);
      server.broadcast({ t: "exit", consoleId: node.id, code });
    });
  };

  // Beside the caller when there is one, else the next cell of a three-column grid.
  const place = (ws: Workspace, caller?: ConsoleNode) => {
    if (caller) return { x: caller.x + caller.w + GAP, y: caller.y };
    const n = ws.nodes.filter((x) => x.type === "console").length;
    return { x: (n % COLUMNS) * (W + GAP), y: Math.floor(n / COLUMNS) * (H + GAP) };
  };

  tracker.onChange((id, status) => {
    const f = find(id);
    if (!f) return;
    f.node.status = status;
    f.node.lastActiveAt = new Date().toISOString();
    changed(f.board);
  });

  const handoffConsole = (id: string) => {
    const f = find(id);
    return f && { node: f.node, teams: f.ws.teams ?? [] };
  };
  const handoffs = new HandoffService({
    home: agentboardHome,
    userHome: homedir(),
    console: handoffConsole,
    tracker,
    replay: (id) => pty.replay(id),
    write: (id, data) => {
      tracker.markInput(id, data);
      pty.write(id, data);
    },
    diff: (path) => git.diff({ path }),
    spawn: async ({ fromConsoleId, title, ...req }) => {
      const node = await routes["POST /api/consoles"]({ ...req, cwd: mustFind(fromConsoleId).node.cwd, callerConsoleId: fromConsoleId }, {});
      const f = mustFind(node.id);
      f.node.title = title;
      changed(f.board);
      return node.id;
    },
    resume: async (id) => void (await routes["POST /api/consoles/:id/resume"](undefined, { id })),
    // ponytail: broadcast only until L42's event log lands; then this appends to it.
    event: (e) => server.broadcast({ t: "event", event: { id: randomUUID(), ts: new Date().toISOString(), ...e } }),
    changed: (id) => {
      const f = find(id);
      if (f) changed(f.board);
    },
  });
  new TeamTriggers({ tracker, console: handoffConsole, service: handoffs });

  // Required: a route added to the shared table without a handler here fails the typecheck.
  const routes: Required<RouteHandlers> = {
    "GET /api/board": async ({ repo }) => loadBoard(repo),
    "PUT /api/board": async (incoming, _params, client) => {
      const current = await loadBoard(incoming.repoPath);
      if (incoming.rev !== undefined && incoming.rev < (current.rev ?? 0)) throw new HttpError(409, "the board changed since this copy was read");
      incoming.rev = (current.rev ?? 0) + 1;
      // The daemon owns each console's status, session and launch fields; the page owns layout and titles.
      const own = new Map(consoles(current).map((n) => [n.id, n]));
      const seen = new Set<string>();
      for (const ws of incoming.workspaces)
        ws.nodes = ws.nodes.map((n) => {
          if (n.type !== "console") return n;
          seen.add(n.id);
          const o = own.get(n.id);
          return o ? { ...n, agent: o.agent, cwd: o.cwd, worktree: o.worktree, session: o.session, customId: o.customId, status: o.status, lastActiveAt: o.lastActiveAt } : n;
        });
      // A running console the page has not heard of yet stays; closing one goes through DELETE.
      for (const ws of current.workspaces)
        for (const n of ws.nodes)
          if (n.type === "console" && !seen.has(n.id) && running.has(n.id)) {
            const target = incoming.workspaces.find((w) => w.id === ws.id) ?? incoming.workspaces.find((w) => w.id === incoming.activeWorkspaceId) ?? incoming.workspaces[0];
            target?.nodes.push(n);
          }
      boards.set(incoming.repoPath, incoming);
      await store.save(incoming);
      // Every other page learns of it; the sender already has it.
      server.broadcast({ t: "board", board: incoming }, client);
      return { ok: true, rev: incoming.rev };
    },
    "POST /api/consoles": async (req) => {
      const caller = req.callerConsoleId ? find(req.callerConsoleId) : undefined;
      const repo = caller?.board.repoPath ?? repoFor(req.cwd);
      const board = await loadBoard(repo);
      const ws = caller?.ws ?? board.workspaces.find((w) => w.id === board.activeWorkspaceId) ?? board.workspaces[0];
      if (!ws) throw new HttpError(400, "board has no workspace");
      const custom = req.agent === "custom" ? await customFor(req.customId) : undefined;
      const now = new Date().toISOString();
      const name = custom?.name ?? NAMES[req.agent];
      const node: ConsoleNode = {
        id: randomUUID(),
        type: "console",
        title: req.worktree ? `${name}: ${req.worktree}` : name,
        ...place(ws, caller?.node),
        w: W,
        h: H,
        agent: req.agent,
        cwd: req.cwd,
        // Claude takes its session id from us (--session-id); the others report theirs in a hook.
        ...(req.agent === "claude" && { session: { provider: "claude" as const, id: randomUUID() } }),
        ...(custom && { customId: custom.id }),
        status: "stopped",
        createdAt: now,
        lastActiveAt: now,
      };
      const prepared = prepare(node, custom, false, req.prompt);
      if (req.worktree) {
        const base = (await git.status({ path: repo })).branch;
        node.worktree = await git.worktree({ repo, name: req.worktree, base });
        node.cwd = node.worktree.path;
      }
      ws.nodes.push(node);
      try {
        start(node, prepared);
      } catch (e) {
        ws.nodes = ws.nodes.filter((n) => n.id !== node.id);
        tracker.remove(node.id);
        throw e;
      }
      changed(board);
      return node;
    },
    "DELETE /api/consoles/:id": async (_, { id }) => {
      const f = mustFind(id!);
      // Off the board first, so the exit this kill causes finds no node and a racing PUT cannot bring it back.
      running.delete(id!);
      adopting.delete(id!);
      f.ws.nodes = f.ws.nodes.filter((n) => n.id !== id);
      changed(f.board);
      if (pty.list().includes(id!)) await pty.kill(id!);
      tracker.remove(id!);
      return { ok: true };
    },
    "POST /api/consoles/:id/resume": async (_, { id }) => {
      const f = mustFind(id!);
      if (running.has(id!)) throw new HttpError(409, `console ${id} is running`);
      if (pty.list().includes(id!)) await pty.kill(id!); // drop the exited entry so the id can spawn again
      const custom = f.node.agent === "custom" ? await customFor(f.node.customId) : undefined;
      // A custom agent has no resume, and claude starts a fresh session when it has none: both launch fresh.
      if (f.node.agent === "claude" && !f.node.session) f.node.session = { provider: "claude", id: randomUUID() };
      start(f.node, prepare(f.node, custom, f.node.agent !== "custom" && f.node.session !== undefined));
      changed(f.board);
      return f.node;
    },
    "GET /api/agents": async () => AgentCatalog.scan({ path: agentPath, custom: (await settings()).customAgents }),
    "GET /api/status": async () => ({ consoles: [...boards.values()].flatMap(consoles) }),
    "POST /hook/:consoleId": async (body, { consoleId }) => {
      const f = mustFind(consoleId!);
      const next = sessionIdOf(body.payload);
      if (adopting.has(consoleId!) && next && next !== f.node.session?.id) {
        adopting.delete(consoleId!);
        f.node.session = { provider: f.node.agent, id: next };
        changed(f.board);
      }
      if (!acceptHook(f.node, body.payload)) return { ok: true };
      if (adoptsNextSession(body.event, body.payload)) adopting.add(consoleId!);
      const sid = sessionFromHook(f.node.agent, body.event, body.payload);
      if (sid && f.node.session?.id !== sid) {
        f.node.session = { provider: f.node.agent, id: sid };
        changed(f.board);
      }
      tracker.handleHook(consoleId!, body);
      return { ok: true };
    },
    "GET /api/git/status": (q) => git.status(q),
    "GET /api/git/diff": (q) => git.diff(q),
    "POST /api/git/worktree": (b) => git.worktree(b),
    "POST /api/git/commit": (b) => git.commit(b),
    "POST /api/git/push": (b) => git.push(b),
    "POST /api/git/pr": (b) => git.pr(b),
    "GET /api/settings": () => settings(),
    "PUT /api/settings": async (s) => {
      const file = settingsFile();
      await mkdir(agentboardHome(), { recursive: true, mode: 0o700 });
      await writeFile(`${file}.tmp`, JSON.stringify(s, null, 2));
      await rename(`${file}.tmp`, file);
      return { ok: true };
    },
    "POST /api/open": (body) => handleOpen(body),
    // ponytail: stubs so this contract typechecks alone; L52 replaces both.
    "POST /api/command/plan": async () => { throw new HttpError(501, "not implemented until L52"); },
    "POST /api/command/run": async () => { throw new HttpError(501, "not implemented until L52"); },
    "POST /api/voice/transcribe": async (input) => {
      const command = (await settings()).voice?.transcribeCommand;
      if (!command) throw new HttpError(412, "no transcriber configured: set Settings › Voice › transcribe command (for example whisper-cli -nt -f)");
      const { audio, mime } = input as unknown as { audio: Buffer; mime: string };
      try {
        return await transcribe(audio, mime, command, agentboardHome());
      } catch (e) {
        throw new HttpError(502, (e as Error).message);
      }
    },
    // Wiring only (P3-D7): the real handlers land with their lanes.
    "POST /api/assets": async () => { throw new HttpError(501, "not implemented until lane L34"); },
    "GET /api/assets/:id": async () => { throw new HttpError(501, "not implemented until lane L34"); },
    "GET /api/preview": async () => { throw new HttpError(501, "not implemented until lane L32"); },
    // Phase 4 stubs; each lane replaces its own (L42 events, L45 handoffs, L47 loops, L49 composer, L4A usage, L4C memory).
    "GET /api/events": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/handoffs": (req) => handoffs.draft(req),
    "PUT /api/handoffs/:id": (h, { id }) => handoffs.update(id!, h),
    "POST /api/handoffs/:id/send": (_, { id }) => handoffs.send(id!),
    "GET /api/handoffs": (q) => handoffs.list(q.console),
    "GET /api/loops": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/loops": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "PUT /api/loops/:id": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "DELETE /api/loops/:id": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/loops/:id/pause": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/loops/:id/resume": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/loops/:id/run": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/composer/launch": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "GET /api/composer/templates": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "GET /api/usage": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "GET /api/usage.csv": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "GET /api/memory": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/memory": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "PUT /api/memory/:id": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "DELETE /api/memory/:id": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/memory/:id/push": async () => { throw new HttpError(501, "phase 4: not built yet"); },
    "POST /api/memory/propose": async () => { throw new HttpError(501, "phase 4: not built yet"); },
  };

  const server = await createServer({
    port: opts.port ?? 0,
    token,
    staticDir: uiDist,
    routes,
    onAttach: async ({ consoleId }, reply) => {
      if (pty.list().includes(consoleId)) reply({ t: "output", consoleId, data: pty.replay(consoleId) });
    },
    onInput: async ({ consoleId, data }) => {
      if (!running.has(consoleId)) return;
      tracker.markInput(consoleId, data);
      pty.write(consoleId, data);
    },
    onResize: async ({ consoleId, cols, rows }) => {
      if (running.has(consoleId)) pty.resize(consoleId, cols, rows);
    },
  });
  const origin = server.origin;
  try {
    await loadBoard(opts.repoPath);
    await daemonFile.write({ port: server.port, token, pid: process.pid });
  } catch (e) {
    await server.close();
    throw e;
  }

  let closing: Promise<void> | undefined;
  return {
    origin,
    port: server.port,
    token,
    // In order: stop taking requests, end the consoles, write the boards, then give up daemon.json.
    close: () =>
      (closing ??= (async () => {
        await server.close();
        await Promise.all([...running].map((id) => pty.kill(id).catch(() => {})));
        await store.flush().catch((e) => console.error("agentboard: board write failed:", (e as Error).message));
        await daemonFile.remove();
      })()),
  };
}
