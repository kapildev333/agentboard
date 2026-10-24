import { useEffect, useState } from "react";
import type { CustomAgent, Settings } from "@agentboard/shared";

export type { CustomAgent, Settings };

// A path field at rest shows the end of its path, the part that tells two apart; editing leaves the caret alone.
const showPathEnd = (el: HTMLInputElement | null) => {
  if (el && el !== document.activeElement) el.scrollLeft = el.scrollWidth;
};

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [size, setSize] = useState(String(settings.fontSize));
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize]);
  // Clamp on blur so typing 18 does not pass through 10 or 24.
  const commitSize = () => {
    const n = Math.min(24, Math.max(10, Math.round(Number(size) || settings.fontSize)));
    setSize(String(n));
    if (n !== settings.fontSize) onChange({ ...settings, fontSize: n });
  };
  const setAgent = (i: number, patch: Partial<CustomAgent>) =>
    onChange({ ...settings, customAgents: settings.customAgents.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div className="settings">
      <section className="settings-section">
        <h3 className="section-title">Terminal</h3>
        <label className="settings-row">
          {/* the label text stays "font size" (tests find the field by it); CSS capitalises the first letter */}
          <span className="settings-row-label">font size</span>
          <input type="number" min={10} max={24} value={size} onChange={(e) => setSize(e.target.value)} onBlur={commitSize} />
        </label>
      </section>
      <section className="settings-section">
        <h3 className="section-title">Custom agents</h3>
        {settings.customAgents.map((a, i) => (
          <div key={a.id} className="card agent-card">
            <label className="field">
              <span className="field-label">Name</span>
              <input aria-label={`name ${i + 1}`} value={a.name} onChange={(e) => setAgent(i, { name: e.target.value })} />
            </label>
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
              <span className="field-label">Arguments</span>
              {/* uncontrolled, so a trailing space survives while typing the next argument */}
              <input
                aria-label={`args ${i + 1}`}
                className="path-field"
                title={a.args.join(" ")}
                ref={showPathEnd}
                onBlur={(e) => showPathEnd(e.currentTarget)}
                defaultValue={a.args.join(" ")}
                onChange={(e) => setAgent(i, { args: e.target.value.split(/\s+/).filter(Boolean) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Needs-you pattern</span>
              <input
                aria-label={`needs-you regex ${i + 1}`}
                className="mono"
                value={a.needsYou ?? ""}
                onChange={(e) => setAgent(i, { needsYou: e.target.value || undefined })}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="btn-sm"
                aria-label={`Remove agent ${i + 1}`}
                onClick={() => onChange({ ...settings, customAgents: settings.customAgents.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="settings-add" onClick={() => onChange({ ...settings, customAgents: [...settings.customAgents, { id: crypto.randomUUID(), name: "", command: "", args: [] }] })}>
          Add agent
        </button>
      </section>
    </div>
  );
}
