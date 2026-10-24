import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Plan, PlanStep } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";

vi.mock("../../src/console", () => ({
  ConsoleNode: ({ data }: { data: { node: { title: string } } }) => <div>{data.node.title}</div>,
}));

beforeAll(() => {
  globalThis.CSS ??= { escape: (s: string) => s } as never;
  HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as never;
});

class FakeRecorder {
  static started = 0;
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    FakeRecorder.started++;
  }
  stop() {
    this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const board: Board = { version: 1, repoPath: "/r", activeWorkspaceId: "main", workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fitStep: PlanStep = { id: "s1", kind: "fit", summary: "Fit all consoles", asks: false };
const closeStep: PlanStep = { id: "s2", kind: "close", consoleIds: ["c1"], summary: "Close Title c1", asks: true };
const resumeStep: PlanStep = { id: "s3", kind: "resume", consoleId: "c2", summary: "Resume docs pass", asks: false };
const mkPlan = (text: string, ...steps: Plan["steps"]): Plan => ({ id: `p-${text}`, text, steps, plannedBy: "rules", ms: 3, reply: `reply to ${text}` });

type Call = { url: string; method: string; body: unknown };
function setup(opts: { transcripts?: string[]; plans?: Record<string, Plan>; transcribeStatus?: number; run?: unknown } = {}) {
  const transcripts = [...(opts.transcripts ?? ["close c1 and fit"])];
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    calls.push({ url: String(url), method, body });
    if (String(url).startsWith("/api/board") && method === "GET") return json(board);
    if (String(url) === "/api/settings") return json({ fontSize: 13, customAgents: [] });
    if (String(url) === "/api/voice/transcribe") {
      if (opts.transcribeStatus) return json({ error: "no transcriber" }, opts.transcribeStatus);
      return json({ text: transcripts.shift() ?? "", ms: 5, engine: "whisper-cli" });
    }
    if (String(url) === "/api/command/plan") return json(opts.plans?.[(body as { text: string }).text] ?? mkPlan((body as { text: string }).text, fitStep, closeStep, resumeStep));
    if (String(url) === "/api/command/run") return json(opts.run ?? { results: [] });
    return json({ ok: true });
  });
  const speak = vi.fn();
  const getUserMedia = vi.fn(async () => ({}) as MediaStream);
  render(
    <App
      fetch={fetch}
      search="?repo=%2Fr"
      connect={() => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} })}
      voice={{ MediaRecorder: FakeRecorder as never, getUserMedia, speak }}
    />,
  );
  return { calls, speak, getUserMedia };
}
const hold = async () => {
  await screen.findByRole("button", { name: "Command" });
  fireEvent.keyDown(window, { code: "Space", key: " ", altKey: true });
};
const release = () => fireEvent.keyUp(window, { code: "Space", key: " " });
const voiceDialog = () => screen.findByRole("dialog", { name: "Voice command" });

beforeEach(() => {
  FakeRecorder.started = 0;
  useBoard.getState().setBoard({ ...board, repoPath: "" });
});
afterEach(cleanup);

describe("useVoice", () => {
  it("hold Alt+Space records and release posts the audio then plans", async () => {
    const { calls } = setup();
    await hold();
    await screen.findByText("listening");
    expect(FakeRecorder.started).toBe(1);
    release();
    const dialog = await voiceDialog();
    await waitFor(() => expect(dialog.textContent).toContain("close c1 and fit"));
    const t = calls.find((c) => c.url === "/api/voice/transcribe")!;
    expect(t.method).toBe("POST");
    expect(t.body).toBeInstanceOf(Blob);
    expect((t.body as Blob).type).toBe("audio/webm");
    const p = calls.find((c) => c.url === "/api/command/plan")!;
    expect(p.method).toBe("POST");
    expect(p.body).toMatchObject({ text: "close c1 and fit" });
    await screen.findByText("Fit all consoles");
    expect(screen.getByText("Close Title c1")).toBeTruthy();
    expect(screen.queryByText("listening")).toBeNull();
  });

  it("an asking step disables Run until confirmed or skipped", async () => {
    setup();
    await hold();
    release();
    await voiceDialog();
    const run = (await screen.findByRole("button", { name: /^Run/ })) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Skip it, do step 3" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm step 2" }));
    expect(run.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^Skip it/ }));
    expect(run.disabled).toBe(false);
    expect(run.textContent).toBe("Run 2 steps");
  });

  it("the reply is spoken once per plan", async () => {
    const { speak } = setup();
    await hold();
    release();
    await screen.findByText("Spoken reply");
    expect(screen.getAllByText("reply to close c1 and fit")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm step 2" }));
    expect(speak.mock.calls.filter(([t]) => t === "reply to close c1 and fit")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(speak.mock.calls.at(-1)).toEqual([""]);
  });

  it("a second hold saying confirm runs the plan with the asking steps confirmed", async () => {
    const { calls } = setup({ transcripts: ["close c1 and fit", "yes"], run: { results: [], fit: true } });
    await hold();
    release();
    await screen.findByText("Close Title c1");
    await hold();
    release();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/command/run")).toBe(true));
    const run = calls.find((c) => c.url === "/api/command/run")!;
    expect(run.body).toMatchObject({ confirmed: ["s2"], skipped: [] });
    expect(calls.filter((c) => c.url === "/api/command/plan")).toHaveLength(1);
  });

  it("412 shows the no-transcriber error with a settings button", async () => {
    setup({ transcribeStatus: 412 });
    await hold();
    release();
    await screen.findByText(/No transcriber configured\. Set one under Settings › Voice\./);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Voice command" })).toBeNull();
  });

  it("the microphone stream is requested once and reused by later holds", async () => {
    const { getUserMedia } = setup({ transcripts: ["one", "two"] });
    await hold();
    await screen.findByText("listening");
    release();
    await screen.findByText("Spoken reply");
    await hold();
    await waitFor(() => expect(FakeRecorder.started).toBe(2));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("losing window focus mid-hold stops the recording and posts the audio", async () => {
    const { calls } = setup();
    await hold();
    await screen.findByText("listening");
    fireEvent.blur(window);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/voice/transcribe")).toBe(true));
  });

  it("a tab that turns hidden mid-hold stops the recording and posts the audio", async () => {
    const { calls } = setup();
    await hold();
    await screen.findByText("listening");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      fireEvent(document, new Event("visibilitychange"));
      await waitFor(() => expect(calls.some((c) => c.url === "/api/voice/transcribe")).toBe(true));
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
  });

  it("a repeated Alt+Space keydown does not start a second recording", async () => {
    setup();
    await hold();
    await screen.findByText("listening");
    fireEvent.keyDown(window, { code: "Space", key: " ", altKey: true, repeat: true });
    expect(FakeRecorder.started).toBe(1);
  });

  it("Type instead puts the transcript in the Command bar input", async () => {
    setup();
    await hold();
    release();
    await screen.findByText("Spoken reply");
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    const bar = await screen.findByRole("dialog", { name: "Command bar" });
    await waitFor(() => expect((bar.querySelector("input") as HTMLInputElement).value).toBe("close c1 and fit"));
  });
});
