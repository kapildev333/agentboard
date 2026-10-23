import { useEffect, useState } from "react";

export type CustomAgent = { name: string; command: string; needsYou?: string };
export type Settings = { fontSize: number; customAgents: CustomAgent[] };

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [size, setSize] = useState(String(settings.fontSize));
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize]);
  // Clamp on blur so typing 18 does not pass through 10 or 24.
  const commitSize = () => {
    const n = Math.min(24, Math.max(10, Number(size) || 10));
    setSize(String(n));
    if (n !== settings.fontSize) onChange({ ...settings, fontSize: n });
  };
  const setAgent = (i: number, patch: Partial<CustomAgent>) =>
    onChange({ ...settings, customAgents: settings.customAgents.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div>
      <label>
        font size
        <input type="number" min={10} max={24} value={size} onChange={(e) => setSize(e.target.value)} onBlur={commitSize} />
      </label>
      {settings.customAgents.map((a, i) => (
        <div key={i}>
          <input aria-label={`name ${i}`} value={a.name} onChange={(e) => setAgent(i, { name: e.target.value })} />
          <input aria-label={`command ${i}`} value={a.command} onChange={(e) => setAgent(i, { command: e.target.value })} />
          <input
            aria-label={`needs-you regex ${i}`}
            value={a.needsYou ?? ""}
            onChange={(e) => setAgent(i, { needsYou: e.target.value || undefined })}
          />
          <button
            type="button"
            aria-label={`Remove agent ${i + 1}`}
            onClick={() => onChange({ ...settings, customAgents: settings.customAgents.filter((_, j) => j !== i) })}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...settings, customAgents: [...settings.customAgents, { name: "", command: "" }] })}>
        Add agent
      </button>
    </div>
  );
}
