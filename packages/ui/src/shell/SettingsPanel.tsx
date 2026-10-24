import "./settings.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AgentInfoListSchema,
  type AgentInfo,
  type CustomAgent,
  type Settings,
  type Signal,
} from "@agentboard/shared";
import { version } from "../../package.json";
import type { Fetch } from "./SpawnDialog";

export type { CustomAgent, Settings };

// A path field at rest shows the end of its path, the part that tells two apart; editing leaves the caret alone.
const showPathEnd = (el: HTMLInputElement | null) => {
  if (el && el !== document.activeElement) el.scrollLeft = el.scrollWidth;
};

// Stable, so the agent list is fetched once per mount.
const browserFetch: Fetch = (input, init) => globalThis.fetch(input, init);

const SECTIONS = ["Terminal", "Agents", "Safety"] as const;
type Section = (typeof SECTIONS)[number];

// How each built-in reports its status; claude, gemini and opencode have hooks or a plugin, the rest are read from output.
const SIGNAL: Record<AgentInfo["id"], Signal> = {
  claude: "hooks",
  gemini: "hooks",
  opencode: "plugin",
  codex: "notify",
  custom: "heuristic",
};
// the chip wording from the Settings artboard
const SIGNAL_LABEL: Record<AgentInfo["id"], string> = {
  claude: "hooks · per session",
  gemini: "hooks",
  opencode: "plugin · events",
  codex: "notify + output",
  custom: "regex",
};
const status = (a: AgentInfo) =>
  !a.available
    ? "Not installed"
    : !a.customId && (SIGNAL[a.id] === "hooks" || SIGNAL[a.id] === "plugin")
      ? "Ready"
      : "Heuristic";

function Mark({ agent, name }: { agent: AgentInfo["id"]; name: string }) {
  const letter =
    agent === "custom"
      ? name.trim().charAt(0).toUpperCase() || "?"
      : { claude: "C", codex: "X", gemini: "G", opencode: "O" }[agent];
  return (
    <span className={`mark mark-${agent}`} aria-hidden="true">
      {letter}
    </span>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  fetch = browserFetch,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  fetch?: Fetch;
}) {
  const [size, setSize] = useState(String(settings.fontSize));
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize]);
  // Clamp on blur so typing 18 does not pass through 10 or 24.
  const commitSize = () => {
    const n = Math.min(
      24,
      Math.max(10, Math.round(Number(size) || settings.fontSize)),
    );
    setSize(String(n));
    if (n !== settings.fontSize) onChange({ ...settings, fontSize: n });
  };
  const setAgent = (i: number, patch: Partial<CustomAgent>) =>
    onChange({
      ...settings,
      customAgents: settings.customAgents.map((a, j) =>
        j === i ? { ...a, ...patch } : a,
      ),
    });

  const [agents, setAgents] = useState<AgentInfo[]>();
  const scan = useCallback(() => {
    fetch("/api/agents")
      .then(async (r) =>
        setAgents(r.ok ? AgentInfoListSchema.parse(await r.json()) : []),
      )
      .catch(() => setAgents([]));
  }, [fetch]);
  useEffect(scan, [scan]);

  // The nav marks the last section whose top has scrolled to the top of the pane, or the last one at the bottom.
  // A clicked section stays marked while it is in view: a short one near the end never reaches the top.
  const pane = useRef<HTMLDivElement>(null);
  const picked = useRef<Section>(undefined);
  const [current, setCurrent] = useState<Section>("Agents");
  const onScroll = () => {
    const p = pane.current!;
    const els = [...p.querySelectorAll<HTMLElement>("[data-section]")];
    const inView = els.find((e) => e.dataset.section === picked.current);
    if (
      inView &&
      inView.offsetTop < p.scrollTop + p.clientHeight &&
      inView.offsetTop + inView.offsetHeight > p.scrollTop
    )
      return;
    picked.current = undefined;
    const atEnd = p.scrollTop + p.clientHeight >= p.scrollHeight - 1;
    const el = atEnd
      ? els.at(-1)!
      : (els.filter((e) => e.offsetTop <= p.scrollTop + 8).at(-1) ?? els[0]!);
    setCurrent(el.dataset.section as Section);
  };
  const go = (s: Section) => {
    picked.current = s;
    setCurrent(s);
    pane.current
      ?.querySelector(`[data-section="${s}"]`)
      ?.scrollIntoView?.({ block: "start" });
  };
  const fontStack = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();

  return (
    <div className="settings-panel">
      <div className="sp-layout">
        <nav aria-label="Settings sections" className="sp-nav">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              className="sp-nav-item"
              aria-current={current === s}
              autoFocus={i === 0}
              onClick={() => go(s)}
            >
              {s}
            </button>
          ))}
          <span className="sp-version">v{version} · MIT</span>
        </nav>
        <div className="sp-content" ref={pane} onScroll={onScroll}>
          <section
            data-section="Agents"
            className="sp-section"
            aria-labelledby="sp-agents"
          >
            <div className="sp-heading-row">
              <h3 id="sp-agents" className="sp-heading">
                Agents found on PATH
              </h3>
              <button type="button" className="btn-sm btn-quiet" onClick={scan}>
                Rescan
              </button>
            </div>
            <p className="sp-caption">
              Status for each console comes from the CLI&apos;s own hooks.
              Agents without them are read from their output.
            </p>
            <table className="sp-table" aria-labelledby="sp-agents">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Version</th>
                  <th scope="col">Signal</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {agents?.map((a) => {
                  const s = status(a);
                  return (
                    <tr key={`${a.id}:${a.customId ?? ""}`}>
                      <td>
                        <span className="sp-agent">
                          <Mark agent={a.id} name={a.name ?? a.id} />
                          {a.name ?? a.id}
                        </span>
                      </td>
                      <td className="sp-mono">{a.version ?? "—"}</td>
                      <td>
                        <span className="chip">
                          {SIGNAL_LABEL[a.customId ? "custom" : a.id]}
                        </span>
                      </td>
                      <td>
                        <span className="sp-status" data-status={s}>
                          <span className="sp-dot" aria-hidden="true" />
                          {s}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {agents?.length === 0 && (
              <p className="sp-caption">
                No agent list from the daemon. Rescan to try again.
              </p>
            )}

            <div className="sp-heading-row">
              <h3 className="sp-heading">Custom agents</h3>
              <button
                type="button"
                className="btn-sm"
                onClick={() =>
                  onChange({
                    ...settings,
                    customAgents: [
                      ...settings.customAgents,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        command: "",
                        args: [],
                      },
                    ],
                  })
                }
              >
                Add agent
              </button>
            </div>
            {settings.customAgents.map((a, i) => (
              <div
                key={a.id}
                role="group"
                aria-label={`Custom agent ${i + 1}`}
                className="sp-card"
              >
                <div className="sp-card-head">
                  <Mark agent="custom" name={a.name} />
                  <input
                    className="sp-name"
                    aria-label={`name ${i + 1}`}
                    placeholder="Name"
                    value={a.name}
                    onChange={(e) => setAgent(i, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-sm btn-quiet sp-danger"
                    aria-label={`Remove agent ${i + 1}`}
                    onClick={() =>
                      onChange({
                        ...settings,
                        customAgents: settings.customAgents.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="sp-fields">
                  <label className="field">
                    <span className="field-label">Command</span>
                    <input
                      aria-label={`command ${i + 1}`}
                      className="path-field"
                      title={a.command}
                      ref={showPathEnd}
                      onBlur={(e) => showPathEnd(e.currentTarget)}
                      value={a.command}
                      onChange={(e) => setAgent(i, { command: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Args</span>
                    {/* uncontrolled, so a trailing space survives while typing the next argument */}
                    <input
                      aria-label={`args ${i + 1}`}
                      className="path-field"
                      title={a.args.join(" ")}
                      ref={showPathEnd}
                      onBlur={(e) => showPathEnd(e.currentTarget)}
                      defaultValue={a.args.join(" ")}
                      onChange={(e) =>
                        setAgent(i, {
                          args: e.target.value.split(/\s+/).filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Needs-you regex</span>
                    <input
                      aria-label={`needs-you regex ${i + 1}`}
                      className="mono"
                      value={a.needsYou ?? ""}
                      onChange={(e) =>
                        setAgent(i, { needsYou: e.target.value || undefined })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </section>

          <section
            data-section="Terminal"
            className="sp-section"
            aria-labelledby="sp-terminal"
          >
            <h3 id="sp-terminal" className="sp-heading">
              Terminal
            </h3>
            <div className="sp-row">
              {/* the label text stays "font size" (tests find the field by it); CSS capitalises the first letter */}
              <label htmlFor="sp-font-size" className="sp-row-label">
                font size
              </label>
              <span className="sp-inline">
                <input
                  id="sp-font-size"
                  className="sp-number"
                  type="number"
                  min={10}
                  max={24}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  onBlur={commitSize}
                />
                <span className="sp-caption">px</span>
              </span>
            </div>
            <div className="sp-row">
              <span className="sp-row-label">Font</span>
              <span className="sp-control sp-mono" title={fontStack}>
                {fontStack || "monospace"}
              </span>
            </div>
            <div className="sp-row">
              <span className="sp-row-label">Scrollback</span>
              <span className="sp-control sp-caption">
                10000 lines · not kept across daemon restarts
              </span>
            </div>
          </section>

          <section
            data-section="Safety"
            className="sp-section"
            aria-labelledby="sp-safety"
          >
            <h3 id="sp-safety" className="sp-heading">
              Safety
            </h3>
            <div className="sp-row">
              <span className="sp-stack">
                <span className="sp-row-label">Auto-approve flags</span>
                <span className="sp-caption">
                  Off for every agent. Loops and handoffs never answer a
                  permission prompt.
                </span>
              </span>
              <span className="sp-chip-ok">locked off</span>
            </div>
            <div className="sp-row">
              <span className="sp-stack">
                <span className="sp-row-label">Daemon bind</span>
                <span className="sp-caption sp-mono">
                  127.0.0.1:{location.port} · token per launch · Origin and Host
                  checked · no CORS
                </span>
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
