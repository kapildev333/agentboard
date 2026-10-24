import { useEffect, useRef, useState } from "react";
import { PlanSchema, RunResponseSchema, TranscribeResponseSchema, type Plan, type StepResult } from "@agentboard/shared";

type Fetch = typeof globalThis.fetch;
export type VoiceState = "idle" | "listening" | "transcribing" | "planning" | "review" | "running" | "error";
export type Decision = "confirmed" | "skipped";
export type VoiceDeps = {
  MediaRecorder?: new (stream: MediaStream) => MediaRecorder;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  /** Speaks the text after cancelling any earlier utterance; "" only cancels. */
  speak?: (text: string) => void;
};

export const NO_TRANSCRIBER = "No transcriber configured. Set one under Settings › Voice.";
const CONFIRM = /^\s*(confirm|yes|go ahead)\W*$/i;

const defaultSpeak = (text: string) => {
  const synth = globalThis.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  if (text) synth.speak(new SpeechSynthesisUtterance(text));
};
const errorOf = async (res: Response) => ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `request failed (${res.status})`;

export function useVoice({ fetch, repo, onFocus, onFit, deps = {} }: {
  fetch: Fetch;
  repo: string;
  onFocus: (id: string) => void;
  onFit: () => void;
  deps?: VoiceDeps;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [engine, setEngine] = useState("");
  const [plan, setPlan] = useState<Plan>();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [results, setResults] = useState<StepResult[]>();
  const [error, setError] = useState<{ message: string; settings?: boolean }>();

  // The listeners are registered once; they read the latest props and state through this.
  const latest = useRef({ state, plan, results, fetch, repo, onFocus, onFit, deps });
  latest.current = { state, plan, results, fetch, repo, onFocus, onFit, deps };
  const held = useRef(false);
  const recorder = useRef<MediaRecorder>(undefined);
  const stream = useRef<MediaStream>(undefined);
  const seq = useRef(0);
  const speak = (text: string) => (latest.current.deps.speak ?? defaultSpeak)(text);

  const fail = (message: string, settings?: boolean) => {
    setError({ message, settings });
    setState("error");
  };

  const runPlan = async (p: Plan, confirmed: string[], skipped: string[]) => {
    const mine = seq.current;
    setState("running");
    try {
      const res = await latest.current.fetch("/api/command/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: p, confirmed, skipped }) });
      if (!res.ok) throw new Error(await errorOf(res));
      const out = RunResponseSchema.parse(await res.json());
      if (mine !== seq.current) return;
      setResults(out.results);
      setState("review");
      if (out.fit) latest.current.onFit();
      if (out.focus) {
        latest.current.onFocus(out.focus);
        reset();
      }
    } catch (e) {
      if (mine === seq.current) fail(e instanceof Error ? e.message : "could not run the plan");
    }
  };

  const finish = async (blob: Blob) => {
    const mine = seq.current;
    const { fetch: f, repo: r, plan: current, results: done } = latest.current;
    setState("transcribing");
    try {
      const res = await f("/api/voice/transcribe", { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob });
      if (mine !== seq.current) return;
      if (res.status === 412) return fail(NO_TRANSCRIBER, true);
      if (!res.ok) throw new Error(await errorOf(res));
      const t = TranscribeResponseSchema.parse(await res.json());
      if (mine !== seq.current) return;
      setEngine(t.engine);
      setTranscript(t.text);
      if (!t.text.trim()) return fail("Nothing heard. Hold the key and try again.");
      // A second hold saying "confirm" answers the plan on screen instead of planning again.
      if (current && !done && CONFIRM.test(t.text)) {
        const ask = current.steps.filter((s) => s.asks).map((s) => s.id);
        setDecisions(Object.fromEntries(ask.map((id) => [id, "confirmed" as const])));
        return void (await runPlan(current, ask, []));
      }
      setState("planning");
      setPlan(undefined);
      setDecisions({});
      setResults(undefined);
      const pres = await f("/api/command/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t.text, repo: r }) });
      if (!pres.ok) throw new Error(await errorOf(pres));
      const p = PlanSchema.parse(await pres.json());
      if (mine !== seq.current) return;
      setPlan(p);
      setState("review");
    } catch (e) {
      if (mine === seq.current) fail(e instanceof Error ? e.message : "could not understand that");
    }
  };

  const start = async () => {
    held.current = true;
    const { deps: d } = latest.current;
    try {
      // The permission prompt happens on the first hold; the stream is kept for the next.
      stream.current ??= await (d.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c)))({ audio: true });
    } catch (e) {
      held.current = false;
      return fail(`Microphone unavailable: ${e instanceof Error ? e.message : "permission denied"}`);
    }
    if (!held.current) return;
    const rec = new (d.MediaRecorder ?? MediaRecorder)(stream.current);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => void finish(new Blob(chunks, { type: rec.mimeType }));
    recorder.current = rec;
    setError(undefined);
    rec.start();
    setState("listening");
  };

  const stop = () => {
    held.current = false;
    const rec = recorder.current;
    recorder.current = undefined;
    rec?.stop();
  };

  useEffect(() => {
    if (!repo) return;
    const down = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== "Space") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || held.current || ["listening", "transcribing", "planning", "running"].includes(latest.current.state)) return;
      void start();
    };
    const up = (e: KeyboardEvent) => (e.code === "Space" || e.key === "Alt") && stop();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", stop);
    const hide = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [repo]);

  const reset = () => {
    seq.current++;
    held.current = false;
    recorder.current = undefined;
    speak("");
    setState("idle");
    setTranscript("");
    setPlan(undefined);
    setDecisions({});
    setResults(undefined);
    setError(undefined);
  };

  // One utterance per plan; speaking cancels the one before.
  useEffect(() => {
    if (plan) speak(plan.reply);
  }, [plan]);

  const asking = plan?.steps.filter((s) => s.asks) ?? [];
  const skipped = Object.keys(decisions).filter((id) => decisions[id] === "skipped");
  return {
    state, transcript, engine, plan, decisions, results, error, asking, skipped,
    undecided: asking.filter((s) => !decisions[s.id]).length,
    decide: (id: string, d: Decision) => setDecisions((m) => ({ ...m, [id]: d })),
    run: () => plan && void runPlan(plan, asking.map((s) => s.id).filter((id) => decisions[id] === "confirmed"), skipped),
    cancel: reset,
  };
}
