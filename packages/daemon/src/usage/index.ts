import { join } from "node:path";
import type { BoardEvent, ConsoleNode, Profile, UsageQuery, UsageReport } from "@agentboard/shared";
import { UsageCache, type Roots } from "./cache.js";
import { mergeSessions, report, toCsv } from "./report.js";

export { UsageCache, type Roots } from "./cache.js";
export { report, toCsv } from "./report.js";

// The env var that moves each CLI's config, and where its session logs sit under it. Gemini has none we know of.
const PROFILE_DIRS: Partial<Record<keyof Roots, [env: string, sub: string]>> = {
  claude: ["CLAUDE_CONFIG_DIR", "projects"],
  codex: ["CODEX_HOME", "sessions"],
  opencode: ["XDG_DATA_HOME", "opencode"],
};

/** The CLIs' documented log folders under home, plus the folder each profile's env moves them to. */
export function scanRoots(home: string, profiles: Profile[]): Roots {
  const roots: Roots = {
    claude: [join(home, ".claude", "projects")],
    codex: [join(home, ".codex", "sessions")],
    gemini: [join(home, ".gemini", "tmp")],
    opencode: [join(home, ".local", "share", "opencode")],
  };
  for (const p of profiles) {
    if (p.agent === "custom") continue;
    const [env, sub] = PROFILE_DIRS[p.agent] ?? [];
    const dir = env && p.env[env];
    if (dir) roots[p.agent].push(join(dir, sub!));
  }
  return roots;
}

export type UsageOptions = {
  /** usage.json, under the agentboard home. */
  file: string;
  roots: () => Roots | Promise<Roots>;
  consoles: () => ConsoleNode[];
  events?: () => BoardEvent[] | Promise<BoardEvent[]>;
};

export class UsageService {
  private readonly cache: UsageCache;

  constructor(private readonly opts: UsageOptions) {
    this.cache = new UsageCache(opts.file, opts.roots);
  }

  async report(query: UsageQuery): Promise<UsageReport> {
    const { sessions, sources } = await this.cache.refresh();
    return report(query, { sessions, sources, consoles: this.opts.consoles(), events: await this.opts.events?.() });
  }

  async csv(query: UsageQuery): Promise<string> {
    return toCsv(await this.report(query));
  }

  /** Tokens a console's session used between from and to (L47's loop runs); null when its session has no parsed log. */
  async tokensSince(consoleId: string, from: Date, to: Date): Promise<number | null> {
    const session = this.opts.consoles().find((c) => c.id === consoleId)?.session;
    if (!session) return null;
    const { sessions } = await this.cache.refresh();
    const s = mergeSessions(sessions.filter((x) => x.agent === session.provider && x.id === session.id))[0];
    if (!s) return null;
    return s.turns.reduce((n, [at, t]) => (at >= from.getTime() && at <= to.getTime() ? n + t : n), 0);
  }
}
