import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, ConsoleNode, Plan, PlanStep } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import { CommandBar } from "../../src/command";

// xterm does not run in jsdom; the console module is L16's and has its own tests.
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

const node = (id: string, status: ConsoleNode["status"] = "working"): ConsoleNode => ({
  id, type: "console", title: `Title ${id}`, x: 0, y: 0, w: 520, h: 340, agent: "custom", cwd: "/r", status,
  createdAt: "2026-10-23T09:00:00.000Z", lastActiveAt: "2026-10-23T09:00:00.000Z",
});
const boardWith = (...nodes: ConsoleNode[]): Board => ({
  version: 1, repoPath: "/r", activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fitStep: PlanStep = { id: "s1", kind: "fit", summary: "Fit all consoles", asks: false };
const closeStep: PlanStep = { id: "s2", kind: "close", consoleIds: ["c1"], summary: "Close Title c1", detail: "It is idle.", asks: true };
const plan = (...steps: Plan["steps"]): Plan => ({ id: "p1", text: "t", steps, plannedBy: "rules", ms: 3, reply: "ok" });

function setup(board: Board, planned: Plan, run: unknown = { results: [] }) {
  const calls: { url: string; method: string; body: { text: string; confirmed: string[]; skipped: string[] } }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : ({} as never) });
    if (String(url).startsWith("/api/board") && method === "GET") return json(board);
    if (String(url) === "/api/settings") return json({ fontSize: 13, customAgents: [] });
    if (String(url) === "/api/command/plan") return json({ ...planned, text: calls.at(-1)!.body.text });
    if (String(url) === "/api/command/run") return json(run);
    return json({ ok: true });
  });
  render(<App fetch={fetch} search="?repo=%2Fr" connect={() => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} })} />);
  return calls;
}
const openBar = async () => {
  await screen.findByRole("button", { name: "Command" });
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  return screen.getByRole("textbox", { name: "Command" });
};
const type = (input: HTMLElement, text: string) => fireEvent.change(input, { target: { value: text } });

beforeEach(() => useBoard.getState().setBoard({ ...boardWith(), repoPath: "" }));
afterEach(cleanup);

describe("CommandBar", () => {
  it("⌘K opens the command bar and Enter plans", async () => {
    const calls = setup(boardWith(node("c1")), plan(fitStep));
    expect(screen.queryByRole("dialog", { name: "Command bar" })).toBeNull();
    const input = await openBar();
    expect(screen.getByRole("dialog", { name: "Command bar" })).toBeTruthy();
    expect(document.activeElement).toBe(input);
    type(input, "fit all consoles");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("safe");
    const post = calls.find((c) => c.url === "/api/command/plan")!;
    expect(post.method).toBe("POST");
    expect(post.body).toEqual({ text: "fit all consoles", repo: "/r" });
    expect(screen.getAllByText("Fit all consoles").length).toBeGreaterThan(0);
  });

  it("typing plans after a 300 ms pause", async () => {
    const calls = setup(boardWith(node("c1")), plan(fitStep));
    const input = await openBar();
    type(input, "fit");
    expect(calls.some((c) => c.url === "/api/command/plan")).toBe(false);
    await screen.findByText("safe");
    expect(calls.filter((c) => c.url === "/api/command/plan")).toHaveLength(1);
  });

  it("an asking step blocks Run until confirmed or skipped", async () => {
    setup(boardWith(node("c1")), plan(closeStep));
    const input = await openBar();
    type(input, "close it");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("asks");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    const run = screen.getByRole("button", { name: "Run 1 step" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(run.title).toMatch(/confirm or skip/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect((screen.getByRole("button", { name: "Run 1 step" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect((screen.getByRole("button", { name: "Run 0 steps" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Run posts confirmed and skipped ids and performs focus and fit", async () => {
    const calls = setup(boardWith(node("c1")), plan(fitStep, closeStep), {
      results: [{ stepId: "s1", status: "done" }, { stepId: "s2", status: "done" }],
      focus: "c1",
      fit: true,
    });
    const onFocus = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    await screen.findByTestId("node-c1");
    const input = await openBar();
    type(input, "x");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("asks");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 2 steps" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/command/run")).toBe(true));
    const post = calls.find((c) => c.url === "/api/command/run")!;
    expect(post.method).toBe("POST");
    expect(post.body.confirmed).toEqual(["s2"]);
    expect(post.body.skipped).toEqual([]);
    // focus closes the dialog so the terminal gets the keys
    await waitFor(() => expect(onFocus).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Command bar" })).toBeNull();
    onFocus.mockRestore();
  });

  it("Alt+Enter runs without focusing", async () => {
    const calls = setup(boardWith(node("c1")), plan(fitStep), { results: [{ stepId: "s1", status: "failed", error: "no such console" }], focus: "c1", fit: true });
    await screen.findByTestId("node-c1");
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const input = await openBar();
    type(input, "x");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("safe");
    fireEvent.keyDown(input, { key: "Enter", altKey: true });
    await waitFor(() => expect(calls.some((c) => c.url === "/api/command/run")).toBe(true));
    expect(await screen.findByText("no such console")).toBeTruthy();
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Command bar" })).toBeTruthy();
    scroll.mockRestore();
  });

  it("Escape closes and returns focus to the trigger", async () => {
    setup(boardWith(), plan(fitStep));
    const trigger = await screen.findByRole("button", { name: "Command" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Command bar" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Command" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Command bar" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("an unknown plan shows the hint and a failed request alerts", async () => {
    setup(boardWith(), { ...plan(), unknown: "Try: fit all consoles" });
    const input = await openBar();
    type(input, "blah");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Try: fit all consoles")).toBeTruthy();
  });

  it("the needs-me suggestion focuses that console", async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    setup(boardWith(node("c1", "needs_you")), plan());
    await screen.findByTestId("node-c1");
    await openBar();
    fireEvent.click(screen.getByRole("button", { name: "Focus the console that needs me · Title c1" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Command bar" })).toBeNull();
    scroll.mockRestore();
  });

  it("closing the idle consoles needs the dialog's confirmation, not the click", async () => {
    const calls = setup(boardWith(node("c1", "idle"), node("c2", "idle")), plan(), { results: [{ stepId: "idle-close", status: "done" }] });
    await openBar();
    fireEvent.click(screen.getByRole("button", { name: "Close the 2 idle consoles" }));
    expect(calls.some((c) => c.url === "/api/command/run")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 1 step" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/command/run")?.body.confirmed).toEqual(["idle-close"]));
  });

  it("Fit and Resume suggestions", async () => {
    const calls = setup(boardWith(node("c1", "stopped")), plan());
    await openBar();
    fireEvent.click(screen.getByRole("button", { name: "Resume Title c1" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/consoles/c1/resume" && c.method === "POST")).toBe(true));
  });
});
void act;

// The component on its own: callbacks are spies, the fetch is scripted per request.
describe("CommandBar in isolation", () => {
  type Reply = Response | Promise<Response>;
  const mount = (reply: (url: string, body: { text: string }) => Reply) => {
    const posts: { url: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      posts.push({ url: String(url), body });
      return reply(String(url), body);
    });
    const onFit = vi.fn();
    const onFocus = vi.fn();
    render(<CommandBar open onClose={() => {}} fetch={fetch} repo="/r" onFocus={onFocus} onFit={onFit} />);
    return { posts, onFit, onFocus, input: screen.getByRole("textbox", { name: "Command" }) };
  };
  const planned = (text: string, ...steps: Plan["steps"]) => json({ ...plan(...steps), text });
  afterEach(() => vi.useRealTimers());

  it("fit after a run that answers fit: true", async () => {
    const { input, onFit } = mount((url, b) => (url.endsWith("/plan") ? planned(b.text, fitStep) : json({ results: [{ stepId: "s1", status: "done" }], fit: true })));
    type(input, "fit");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("safe");
    expect(onFit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onFit).toHaveBeenCalledTimes(1));
  });

  it("a plan response that arrives after the text changed is dropped", async () => {
    let late!: (r: Response) => void;
    const { input } = mount((_, b) => (b.text === "a" ? new Promise<Response>((r) => (late = r)) : planned(b.text, closeStep)));
    type(input, "a");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(late).toBeTypeOf("function"));
    type(input, "ab");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("Close Title c1");
    await act(async () => late(planned("a", fitStep)));
    expect(screen.queryByText("Fit all consoles", { selector: "span" })).toBeNull();
    expect(screen.getByText("Close Title c1")).toBeTruthy();
  });

  it("plans 300 ms after the last edit, once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { input, posts } = mount((_, b) => planned(b.text, fitStep));
    type(input, "f");
    act(() => void vi.advanceTimersByTime(200));
    type(input, "fi");
    act(() => void vi.advanceTimersByTime(299));
    expect(posts).toHaveLength(0);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body.text).toBe("fi");
  });

  it("posts the skipped ids", async () => {
    const { input, posts } = mount((url, b) => (url.endsWith("/plan") ? planned(b.text, fitStep, closeStep) : json({ results: [] })));
    type(input, "x");
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("asks");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Run 1 step" }));
    await waitFor(() => expect(posts.some((p) => p.url.endsWith("/run"))).toBe(true));
    const run = posts.find((p) => p.url.endsWith("/run"))!;
    expect(run.body.skipped).toEqual(["s2"]);
    expect(run.body.confirmed).toEqual([]);
  });

  it("a failed request alerts with the daemon's error", async () => {
    const { input } = mount(() => json({ error: "planner is down" }, 500));
    type(input, "x");
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toBe("planner is down");
  });
});

describe("⌘K capture", () => {
  it("opens even from an element that stops keydown propagation", async () => {
    setup(boardWith(), plan(fitStep));
    await screen.findByRole("button", { name: "Command" });
    const el = document.createElement("input");
    el.addEventListener("keydown", (e) => e.stopPropagation());
    document.body.append(el);
    el.focus();
    fireEvent.keyDown(el, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Command bar" })).toBeTruthy();
    el.remove();
  });
});
