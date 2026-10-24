import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import type { UsageReport } from "@agentboard/shared";
import { parseClaude } from "./parsers/claude.js";
import { parseCodex } from "./parsers/codex.js";
import { parseGemini } from "./parsers/gemini.js";
import type { Parse, Session } from "./parsers/index.js";
import { parseOpencode } from "./parsers/opencode.js";

export type UsageAgent = "claude" | "codex" | "gemini" | "opencode";
/** The directories each CLI writes its session logs under. */
export type Roots = Record<UsageAgent, string[]>;
export type Source = UsageReport["sources"][number];
type Entry = { path: string; size: number; mtimeMs: number; sessions: Session[] | null };

// Bump when a parser changes what it reads, so every file is parsed again.
const VERSION = 1;
const PARSERS: Record<UsageAgent, { match: RegExp; parse: Parse }> = {
  claude: { match: /\.jsonl$/, parse: parseClaude },
  codex: { match: /\.jsonl$/, parse: parseCodex },
  gemini: { match: /(^|\/)(logs\.json|chats\/[^/]+\.json)$/, parse: parseGemini },
  opencode: { match: /^storage\/(message|session)\/.+\.json$/, parse: parseOpencode },
};

const tilde = (p: string) => (p === homedir() || p.startsWith(homedir() + sep) ? "~" + p.slice(homedir().length) : p);

/** Parsed sessions per log file in one JSON file, re-parsing a file only when its size or mtime changed (P4-D46). */
export class UsageCache {
  private entries: Map<string, Entry> | undefined;
  private running: Promise<{ sessions: Session[]; sources: Source[] }> | undefined;

  constructor(private readonly file: string, private readonly roots: () => Roots | Promise<Roots>) {}

  /** Concurrent callers share one pass. */
  refresh(): Promise<{ sessions: Session[]; sources: Source[] }> {
    return (this.running ??= this.pass().finally(() => (this.running = undefined)));
  }

  private async pass() {
    const old = (this.entries ??= await this.load());
    const next = new Map<string, Entry>();
    const sources: Source[] = [];
    const roots = await this.roots();
    for (const agent of Object.keys(PARSERS) as UsageAgent[]) {
      const { match, parse } = PARSERS[agent];
      for (const root of new Set(roots[agent])) {
        const rels = await readdir(root, { recursive: true }).catch(() => [] as string[]);
        let files = 0;
        for (const rel of rels) {
          if (!match.test(rel.split(sep).join("/"))) continue;
          const path = join(root, rel);
          const st = await stat(path).catch(() => null);
          if (!st?.isFile()) continue;
          let e = old.get(path);
          if (!e || e.size !== st.size || e.mtimeMs !== st.mtimeMs) {
            const text = await readFile(path, "utf8").catch(() => null);
            if (text === null) continue;
            e = { path, size: st.size, mtimeMs: st.mtimeMs, sessions: parse(text, path) };
          }
          next.set(path, e);
          if (e.sessions) files++;
        }
        sources.push({ agent, path: tilde(root), files });
      }
    }
    this.entries = next;
    await this.save();
    return { sessions: [...next.values()].flatMap((e) => e.sessions ?? []), sources };
  }

  private async load(): Promise<Map<string, Entry>> {
    try {
      const doc = JSON.parse(await readFile(this.file, "utf8")) as { version?: number; files?: Entry[] };
      return new Map(doc.version === VERSION ? (doc.files ?? []).map((e) => [e.path, e]) : []);
    } catch {
      return new Map(); // missing or unreadable: parse everything again
    }
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFile(`${this.file}.tmp`, JSON.stringify({ version: VERSION, files: [...this.entries!.values()] }));
    await rename(`${this.file}.tmp`, this.file);
  }
}
