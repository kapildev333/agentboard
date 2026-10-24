import { useEffect } from "react";
import type { useVoice } from "./useVoice";

const WAVE = [4, 9, 14, 8, 17, 11, 6, 15, 9, 5, 12, 7];
const STATUS: Partial<Record<string, string>> = { listening: "Listening…", transcribing: "Transcribing…", planning: "Planning…", running: "Running…" };

export function VoiceDialog({ voice, onOpenSettings, onTypeInstead }: {
  voice: ReturnType<typeof useVoice>;
  onOpenSettings: () => void;
  onTypeInstead: (text: string) => void;
}) {
  const { state, transcript, engine, plan, decisions, results, error, asking, undecided, skipped } = voice;
  const open = state !== "idle";
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && voice.cancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;

  const steps = plan?.steps ?? [];
  const count = steps.length - skipped.length;
  const need = asking.length === 1 ? "one needs your OK" : `${asking.length} need your OK`;
  const why = undecided ? `Confirm or skip ${undecided} asking ${undecided === 1 ? "step" : "steps"} first` : undefined;
  return (
    <div role="dialog" aria-label="Voice command" className="voice">
      <div className="voice-head">
        <span className={state === "listening" ? "voice-mic voice-mic-live" : "voice-mic"} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </span>
        <span className={state === "listening" ? "voice-wave voice-wave-live" : "voice-wave"} aria-hidden="true">
          {WAVE.map((h, i) => <i key={i} style={{ height: h, animationDelay: `${i * 70}ms` }} />)}
        </span>
        <p className="voice-transcript">{transcript ? `“${transcript}”` : <span className="muted">{STATUS[state]}</span>}</p>
        <kbd>hold ⌥Space</kbd>
      </div>
      {error && (
        <p role="alert" className="command-error">
          {error.message}{" "}
          {error.settings && <button type="button" className="btn-sm" onClick={onOpenSettings}>Open settings</button>}
        </p>
      )}
      {plan && (
        <div className="voice-body">
          <section aria-label="Plan">
            <h3 className="command-heading">
              Plan · {steps.length} {steps.length === 1 ? "step" : "steps"}
              {asking.length > 0 && <span className="muted"> · {need}</span>}
            </h3>
            {plan.unknown && <p className="command-hint">{plan.unknown}</p>}
            <ol className="command-steps">
              {steps.map((s, i) => {
                const r = results?.find((x) => x.stepId === s.id);
                const d = decisions[s.id];
                return (
                  <li key={s.id} className={s.asks && !d ? "command-step voice-asking" : "command-step"}>
                    <div className="command-step-main">
                      <span>{s.summary}</span>
                      {s.detail && <span className="muted command-detail">{s.detail}</span>}
                      {r && <span className={`command-result command-result-${r.status}`}>{r.status}</span>}
                      {r?.error && <span className="command-result-error">{r.error}</span>}
                    </div>
                    {s.asks && !results && (
                      <span className="command-toggles">
                        <button type="button" className="btn-sm" aria-pressed={d === "confirmed"} onClick={() => voice.decide(s.id, "confirmed")}>Confirm step {i + 1}</button>
                        <button type="button" className="btn-sm" aria-pressed={d === "skipped"} onClick={() => voice.decide(s.id, "skipped")}>
                          {steps[i + 1] ? `Skip it, do step ${i + 2}` : "Skip it"}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
          <section aria-label="Spoken reply">
            <h3 className="command-heading">Spoken reply</h3>
            <p>{plan.reply}</p>
            <ul className="voice-status muted">
              <li>transcribed on this machine · {engine}</li>
              <li>planned by {plan.plannedBy === "rules" ? "rules" : plan.plannedBy.model} · board snapshot only</li>
              <li>reply voice: system TTS</li>
            </ul>
          </section>
        </div>
      )}
      <footer className="command-footer">
        <span className="muted command-keys">
          Release the key to stop listening.{asking.length > 0 && !results && " Nothing runs until you confirm the red step."}
        </span>
        {plan && steps.length > 0 && !results && (
          <button type="button" className="btn-primary" disabled={!!why || state === "running"} title={why} onClick={voice.run}>
            Run {count} {count === 1 ? "step" : "steps"}
          </button>
        )}
        <button type="button" onClick={() => onTypeInstead(transcript)}>Type instead</button>
        <button type="button" onClick={voice.cancel}>Cancel</button>
      </footer>
    </div>
  );
}
