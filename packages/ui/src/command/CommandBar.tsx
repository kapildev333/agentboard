import { useEffect, useRef, useState } from "react";
import { PlanSchema, RunResponseSchema, type Plan, type StepResult } from "@agentboard/shared";
import { useBoard } from "../board";

type Fetch = typeof globalThis.fetch;
type Decision = "confirmed" | "skipped";

const post = (fetch: Fetch, url: string, body?: unknown) =>
  fetch(url, { method: "POST", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
const errorOf = async (res: Response) => ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `request failed (${res.status})`;

export function CommandBar({ open, onClose, fetch, repo, onFocus, onFit }: {
  open: boolean;
  onClose: () => void;
  fetch: Fetch;
  repo: string;
  onFocus: (id: string) => void;
  onFit: () => void;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan>();
  const [edit, setEdit] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [results, setResults] = useState<StepResult[]>();
  const [error, setError] = useState<string>();
  const seq = useRef(0);
  const trigger = useRef<Element | null>(null);
  const keepFocus = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const ws = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId));
  const consoles = (ws?.nodes ?? []).flatMap((n) => (n.type === "console" ? [n] : []));

  const reset = () => {
    setPlan(undefined);
    setEdit(false);
    setDecisions({});
    setResults(undefined);
    setError(undefined);
  };

  // Opening takes focus from the trigger and closing gives it back, unless a focus or an action elsewhere took it.
  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement;
    input.current?.focus();
    return () => {
      seq.current++;
      setText("");
      reset();
      if (!keepFocus.current) (trigger.current as HTMLElement | null)?.focus?.();
      keepFocus.current = false;
    };
  }, [open]);

  // The window listener sees Escape wherever focus is inside the dialog.
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const doPlan = async (t: string) => {
    const mine = ++seq.current;
    reset();
    if (!t.trim()) return;
    try {
      const res = await post(fetch, "/api/command/plan", { text: t, repo });
      if (!res.ok) throw new Error(await errorOf(res));
      const p = PlanSchema.parse(await res.json());
      if (mine === seq.current) setPlan(p);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : "could not plan");
    }
  };

  // Typing plans after a 300 ms pause; a change drops the previous request's result.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const change = (t: string) => {
    setText(t);
    seq.current++;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void doPlan(t), 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const asking = plan?.steps.filter((s) => s.asks) ?? [];
  const undecided = asking.filter((s) => !decisions[s.id]).length;
  const skipped = Object.keys(decisions).filter((id) => decisions[id] === "skipped");
  const count = (plan?.steps.length ?? 0) - skipped.length;

  // Leaves the dialog for something that takes focus itself (a console, a resumed terminal).
  const leave = (then: () => void) => {
    keepFocus.current = true;
    onClose();
    then();
  };

  const run = async (focus: boolean) => {
    if (!plan || undecided) return setEdit(true);
    setError(undefined);
    try {
      const res = await post(fetch, "/api/command/run", { plan, confirmed: asking.map((s) => s.id).filter((id) => decisions[id] === "confirmed"), skipped });
      if (!res.ok) throw new Error(await errorOf(res));
      const out = RunResponseSchema.parse(await res.json());
      setResults(out.results);
      if (out.fit) onFit();
      if (out.focus && focus) leave(() => onFocus(out.focus!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not run the plan");
    }
  };

  const decide = (id: string, d: Decision) => setDecisions((m) => (m[id] === d ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)) : { ...m, [id]: d }));

  const idle = consoles.filter((c) => c.status === "idle");
  const needsMe = consoles.find((c) => c.status === "needs_you");
  const stopped = consoles.filter((c) => c.status === "stopped" || c.status === "exited");
  const closeIdle = () => {
    clearTimeout(timer.current);
    seq.current++;
    reset();
    setPlan({
      id: "local-close-idle",
      text: `Close the ${idle.length} idle consoles`,
      steps: [{ id: "idle-close", kind: "close", consoleIds: idle.map((c) => c.id), summary: `Close ${idle.map((c) => c.title).join(", ")}`, asks: true }],
      plannedBy: "rules",
      ms: 0,
      reply: "",
    });
    setEdit(true);
  };
  const resume = async (id: string) => {
    const res = await post(fetch, `/api/consoles/${encodeURIComponent(id)}/resume`).catch(() => null);
    if (res?.ok) leave(() => {});
    else setError(res ? await errorOf(res) : "could not resume");
  };

  if (!open) return null;
  const resultOf = (id: string) => results?.find((r) => r.stepId === id);
  const why = undecided ? `Confirm or skip ${undecided} asking ${undecided === 1 ? "step" : "steps"} first` : undefined;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div role="dialog" aria-label="Command bar" className="command">
        <div className="command-input">
          <span aria-hidden="true" className="command-prompt">›</span>
          <input
            ref={input}
            aria-label="Command"
            value={text}
            placeholder="Tell the board what to do…"
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (e.shiftKey) return setEdit((v) => !v);
              clearTimeout(timer.current);
              if (plan && plan.text === text) void run(!e.altKey);
              else void doPlan(text);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        {error && <p role="alert" className="command-error">{error}</p>}
        {plan?.unknown && <p className="command-hint">{plan.unknown}</p>}
        {plan && plan.steps.length > 0 && (
          <section aria-label="Plan">
            <h3 className="command-heading">
              Plan · {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
              <span className="muted"> planned by {plan.plannedBy === "rules" ? "rules" : plan.plannedBy.model} · {plan.ms} ms</span>
            </h3>
            <ol className="command-steps">
              {plan.steps.map((s) => {
                const r = resultOf(s.id);
                return (
                  <li key={s.id} className="command-step">
                    <div className="command-step-main">
                      <span>{s.summary}</span>
                      {s.detail && <span className="muted command-detail">{s.detail}</span>}
                      {r && <span className={`command-result command-result-${r.status}`}>{r.status}</span>}
                      {r?.error && <span className="command-result-error">{r.error}</span>}
                    </div>
                    <span className={s.asks ? "cmd-chip cmd-chip-asks" : "cmd-chip cmd-chip-safe"}>{s.asks ? "asks" : "safe"}</span>
                    {edit && s.asks && (
                      <span className="command-toggles">
                        <button type="button" className="btn-sm" aria-pressed={decisions[s.id] === "confirmed"} onClick={() => decide(s.id, "confirmed")}>Confirm</button>
                        <button type="button" className="btn-sm" aria-pressed={decisions[s.id] === "skipped"} onClick={() => decide(s.id, "skipped")}>Skip</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="muted command-lock">
              Steps that close consoles or type into a running terminal always stop here and ask.{" "}
              {asking.length ? `This plan has ${asking.length}.` : "This plan has none."}
            </p>
          </section>
        )}
        <section aria-label="Or jump to">
          <h3 className="command-heading">Or jump to</h3>
          <div className="command-jumps">
            {needsMe && <button type="button" onClick={() => leave(() => onFocus(needsMe.id))}>Focus the console that needs me · {needsMe.title}</button>}
            <button type="button" onClick={() => leave(onFit)}>Fit all consoles</button>
            {idle.length > 0 && <button type="button" onClick={closeIdle}>Close the {idle.length} idle consoles</button>}
            {stopped.map((c) => <button key={c.id} type="button" onClick={() => void resume(c.id)}>Resume {c.title}</button>)}
          </div>
        </section>
        <footer className="command-footer">
          <span className="muted command-keys"><kbd>↵</kbd> run plan <kbd>⇧↵</kbd> edit steps <kbd>⌥↵</kbd> run without focusing</span>
          {plan && plan.steps.length > 0 && (
            <>
              <button type="button" aria-pressed={edit} onClick={() => setEdit(!edit)}>Edit steps</button>
              <button type="button" className="btn-primary" disabled={!!why} title={why} onClick={() => void run(true)}>
                Run {count} {count === 1 ? "step" : "steps"}
              </button>
            </>
          )}
        </footer>
      </div>
    </>
  );
}
