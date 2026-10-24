import { useEffect, useId, useState, type ReactNode } from "react";
import { IntegrationsSchema, type Integrations } from "@agentboard/shared";
import "../styles/integrations.css";

type Fetch = typeof globalThis.fetch;

// The subcommands in packages/cli/src/commands, the lines in packages/mcp/README.md and the plugins' READMEs.
const COMMANDS: [string, ReactNode][] = [
  ["agentboard open [path]", "Open a repo as a board in the browser; starts the daemon if none answers"],
  ["agentboard spawn <agent>", <><code>--worktree name</code> <code>--prompt text</code> <code>--repo path</code> <code>--id custom</code></>],
  ["agentboard note <text>", "A note on the board of the repo you are in"],
  ["agentboard status", <>Whether the daemon answers; <code>--json</code> adds every console and its state</>],
  ["agentboard start", "Run the daemon in this terminal"],
];
const SPAWN_EXAMPLE = `$ agentboard spawn opencode --worktree feat-x --prompt "add tests"
{
  "id": "8f2a51c0-…",
  "type": "console",
  "title": "OpenCode: feat-x",
  "agent": "opencode",
  "worktree": { "path": "…/.worktrees/feat-x", "branch": "feat-x", "base": "main" },
  "status": "starting"
}`;
const TOOLS = ["open_board", "spawn_console", "list_consoles", "add_note", "get_status"];
const CLIS = [
  { id: "claude", mark: "C", label: "Register in Claude Code", line: "claude mcp add agentboard -- agentboard-mcp" },
  { id: "codex", mark: "X", label: "Add to ~/.codex/config.toml", line: '[mcp_servers.agentboard]\ncommand = "agentboard-mcp"\nargs = []' },
  { id: "gemini", mark: "G", label: "Add to ~/.gemini/settings.json", line: '{ "mcpServers": { "agentboard": { "command": "agentboard-mcp" } } }' },
  { id: "opencode", mark: "O", label: "Add to opencode.json", line: '{ "mcp": { "agentboard": { "type": "local", "command": ["agentboard-mcp"] } } }' },
] as const;
const CLAUDE_PLUGIN = "claude plugin marketplace add kapildev333/agentboard\nclaude plugin install agentboard@agentboard";
const POLL_MS = 5000;

// The server's own refusals: Host, Origin, token. A handler's 4xx is an answer, not a refusal.
const refused = (result: string) => /^40[13]\b/.test(result);
const ago = (at: string | undefined, now: Date) => {
  if (!at) return "not seen yet";
  const min = Math.floor((now.getTime() - Date.parse(at)) / 60_000);
  return min < 1 ? "last call just now" : `last call ${min} min ago`;
};

function Seen({ at, now }: { at: string | undefined; now: Date }) {
  return (
    <span className={at ? "int-seen on" : "int-seen"}>
      <span className="int-dot" aria-hidden="true" />
      {ago(at, now)}
    </span>
  );
}

function Card({ title, aside, wide, children }: { title: string; aside?: ReactNode; wide?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={wide ? "int-card wide" : "int-card"} aria-labelledby={id}>
      <div className="int-card-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The Integrations page (F4.1 to F4.4): how a CLI reaches the daemon, and what it saw. It observes only (D48). */
export function IntegrationsPage({ fetch, onBack, host = location.host, now: clock = () => new Date() }: {
  fetch: Fetch;
  onBack: () => void;
  host?: string;
  now?: () => Date;
}) {
  const [data, setData] = useState<Integrations>();
  const [error, setError] = useState(false);
  const [cli, setCli] = useState<(typeof CLIS)[number]["id"]>("claude");
  const [copied, setCopied] = useState(false);
  const now = clock();

  useEffect(() => {
    let live = true;
    const read = () =>
      fetch("/api/integrations")
        .then(async (r) => (r.ok ? IntegrationsSchema.parse(await r.json()) : Promise.reject(new Error(String(r.status)))))
        .then((d) => live && (setData(d), setError(false)))
        .catch(() => live && setError(true));
    void read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [fetch]);

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onBack]);

  const tab = CLIS.find((c) => c.id === cli)!;
  const copy = () =>
    void navigator.clipboard?.writeText(tab.line).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  const seen = data?.seen ?? {};
  const today = now.toDateString();
  const refusedToday = data?.log.filter((e) => refused(e.result) && new Date(e.at).toDateString() === today).length ?? 0;

  return (
    <div className="integrations">
      <div className="int-page">
        <button type="button" className="btn-sm int-back" onClick={onBack}>
          ← Back to board
        </button>
        <div className="int-intro">
          <div>
            <h1>Integrations</h1>
            <p className="muted">
              Any agent can open the board or spawn a console: a command, an MCP server, or a plugin. All three read the port and token from{" "}
              <code>~/.agentboard/daemon.json</code>.
            </p>
          </div>
          <div className="int-summary">
            <span>command <Seen at={seen.command} now={now} /></span>
            <span>MCP <Seen at={seen.mcp} now={now} /></span>
          </div>
        </div>

        <div className="int-grid">
          <Card title="The command">
            <p className="muted int-note">Every subcommand prints JSON, so shell scripts and agents can parse it.</p>
            <dl className="int-commands">
              {COMMANDS.map(([cmd, what]) => (
                <div key={cmd}>
                  <dt>{cmd}</dt>
                  <dd className="muted">{what}</dd>
                </div>
              ))}
            </dl>
            <pre className="int-code">{SPAWN_EXAMPLE}</pre>
          </Card>

          <Card title="MCP server" aside={<span className="chip">stdio · {TOOLS.length} tools</span>}>
            <p className="muted int-note">
              One entry registers it. Tools:{" "}
              {TOOLS.map((t) => (
                <code key={t}>{t}</code>
              ))}
            </p>
            <div className="int-tabs" role="tablist" aria-label="CLI">
              {CLIS.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === cli} className={c.id === cli ? "int-tab on" : "int-tab"}
                  onClick={() => (setCli(c.id), setCopied(false))}>
                  <span className={`mark mark-${c.id}`} aria-hidden="true">{c.mark}</span>
                  {c.id}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="int-panel">
              <div className="int-card-head">
                <span className="section-title">{tab.label}</span>
                <button type="button" className="btn-sm" onClick={copy}>Copy</button>
                {copied && <span className="int-copied" role="status">Copied</span>}
              </div>
              <pre className="int-code">{tab.line}</pre>
              <Seen at={seen.mcp} now={now} />
            </div>
          </Card>

          <Card title="Plugins">
            <div className="int-plugin">
              <div className="int-card-head">
                <span className="mark mark-claude" aria-hidden="true">C</span>
                <strong>Claude Code plugin</strong>
                <Seen at={seen.claudePlugin} now={now} />
              </div>
              <span className="muted int-note">
                Adds <code>/board</code> and the status hooks for the consoles the board launched.
              </span>
              <pre className="int-code">{CLAUDE_PLUGIN}</pre>
            </div>
            <div className="int-plugin">
              <div className="int-card-head">
                <span className="mark mark-opencode" aria-hidden="true">O</span>
                <strong>OpenCode plugin</strong>
                <Seen at={seen.opencodePlugin} now={now} />
              </div>
              <span className="muted int-note">
                One file. Reports <code>session.status</code>, <code>session.idle</code> and <code>permission.asked</code>, and gives the agent an{" "}
                <code>agentboard_spawn</code> tool. Copy or symlink <code>packages/plugins/opencode/dist/agentboard.js</code> to:
              </span>
              <pre className="int-code">~/.config/opencode/plugins/agentboard.js</pre>
            </div>
          </Card>

          <Card
            title="Calls received by the daemon"
            wide
            aside={
              <span className="int-meta">
                {host} · token checked · Origin and Host checked · {refusedToday} refused today
              </span>
            }
          >
            {error && <p role="alert" className="int-error">Could not read the daemon's log.</p>}
            <table className="int-log">
              <thead>
                <tr><th>time</th><th>from</th><th>call</th><th>result</th></tr>
              </thead>
              <tbody>
                {data?.log.map((e, i) => {
                  const bad = refused(e.result);
                  return (
                    <tr key={`${e.at}-${i}`} className={bad ? "refused" : undefined}>
                      <td className="muted">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</td>
                      <td>{bad && e.origin ? e.origin : e.source}</td>
                      <td>{e.route}</td>
                      <td>{e.result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data && !data.log.length && <p className="muted int-note">No calls yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
