import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleNode } from "@agentboard/shared";
import { SpawnDialog } from "../../src/shell";

const node: ConsoleNode = {
  id: "c1",
  type: "console",
  title: "Codex",
  x: 0,
  y: 0,
  w: 640,
  h: 400,
  agent: "codex",
  cwd: "/r",
  status: "working",
  createdAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:00:00.000Z",
};
const agents = [
  { id: "claude", command: "claude", version: "2.1.0", available: true },
  { id: "codex", command: "codex", version: "0.9.1", available: true },
  { id: "opencode", command: "opencode", version: null, available: true },
  { id: "gemini", command: "gemini", version: null, available: false },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fakeFetch = (post: () => Response = () => json(node)) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    init?.method === "POST" ? post() : json(agents),
  );

afterEach(cleanup);

describe("SpawnDialog", () => {
  it("submitting the dialog posts the chosen agent", async () => {
    const fetch = fakeFetch();
    const onSpawned = vi.fn();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={onSpawned} />);
    fireEvent.click(await screen.findByLabelText(/codex/));
    fireEvent.click(screen.getByRole("button", { name: "Spawn" }));
    await waitFor(() => expect(onSpawned).toHaveBeenCalledWith(node));
    const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(post[0]).toBe("/api/consoles");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ agent: "codex", cwd: "/r" });
  });

  it("unavailable agents cannot be selected", async () => {
    render(<SpawnDialog fetch={fakeFetch()} cwd="/r" onSpawned={vi.fn()} />);
    const gemini = (await screen.findByLabelText(/gemini/)) as HTMLInputElement;
    expect(gemini.disabled).toBe(true);
    expect((screen.getByLabelText(/claude/) as HTMLInputElement).disabled).toBe(false);
  });

  it("a failed spawn shows the error", async () => {
    const onSpawned = vi.fn();
    render(<SpawnDialog fetch={fakeFetch(() => json({ error: "no such repo" }, 500))} cwd="/r" onSpawned={onSpawned} />);
    fireEvent.click(await screen.findByLabelText(/claude/));
    fireEvent.click(screen.getByRole("button", { name: "Spawn" }));
    expect((await screen.findByRole("alert")).textContent).toBe("no such repo");
    expect(onSpawned).not.toHaveBeenCalled();
  });

  it("worktree branch (trimmed) and prompt reach the request body", async () => {
    const fetch = fakeFetch();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/claude/));
    fireEvent.click(screen.getByLabelText("new worktree"));
    const spawn = screen.getByRole("button", { name: "Spawn" }) as HTMLButtonElement;
    expect(spawn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("branch name"), { target: { value: "  feat-x " } });
    fireEvent.change(screen.getByLabelText("first prompt"), { target: { value: "hello" } });
    fireEvent.click(spawn);
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true));
    const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ agent: "claude", cwd: "/r", worktree: "feat-x", prompt: "hello" });
  });

  it("a second submit is blocked while the POST is in flight", async () => {
    let release!: () => void;
    const fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== "POST") return json(agents);
      await new Promise<void>((r) => (release = r));
      return json(node);
    });
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/claude/));
    const spawn = screen.getByRole("button", { name: "Spawn" }) as HTMLButtonElement;
    fireEvent.click(spawn);
    await waitFor(() => expect(spawn.disabled).toBe(true));
    release();
    await waitFor(() => expect(spawn.disabled).toBe(false));
  });

  it("a non-JSON failure shows spawn failed (status)", async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST" ? new Response("<html>bad gateway</html>", { status: 502 }) : json(agents),
    );
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/claude/));
    fireEvent.click(screen.getByRole("button", { name: "Spawn" }));
    expect((await screen.findByRole("alert")).textContent).toBe("spawn failed (502)");
  });

  it("a failed agents load shows the error", async () => {
    const fetch = vi.fn(async () => json({ error: "daemon down" }, 500));
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("daemon down");
  });

  it("Cancel closes without posting", async () => {
    const fetch = fakeFetch();
    const onCancel = vi.fn();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(await screen.findByLabelText(/codex/));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });

  it("the first installed agent takes focus when the list arrives", async () => {
    const list = [agents[3], agents[1], agents[0]];
    render(<SpawnDialog fetch={vi.fn(async () => json(list))} cwd="/r" onSpawned={vi.fn()} />);
    const codex = await screen.findByLabelText(/codex/);
    await waitFor(() => expect(document.activeElement).toBe(codex));
  });

  it("agents sit in a fieldset legend Agent", async () => {
    render(<SpawnDialog fetch={fakeFetch()} cwd="/r" onSpawned={vi.fn()} />);
    await screen.findByLabelText(/claude/);
    expect(screen.getByRole("group", { name: "Agent" })).toBeTruthy();
  });

  it("not installed shows only for unavailable agents", async () => {
    render(<SpawnDialog fetch={fakeFetch()} cwd="/r" onSpawned={vi.fn()} />);
    expect((await screen.findByLabelText(/gemini/)).parentElement!.textContent).toContain("not installed");
    expect(screen.getByLabelText(/opencode/).parentElement!.textContent).not.toContain("not installed");
  });

  it("custom agents show their name, keep distinct choices and post their customId (L14)", async () => {
    const customs = [
      { id: "custom", command: "/bin/a", version: null, available: true, customId: "a", name: "Agent A" },
      { id: "custom", command: "/bin/b", version: null, available: true, customId: "b", name: "Agent B" },
    ];
    const fetch = vi.fn(async (_: string | URL | Request, init?: RequestInit) => (init?.method === "POST" ? json(node) : json(customs)));
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/Agent B/));
    expect((screen.getByLabelText(/Agent A/) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Spawn" }));
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true));
    const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ agent: "custom", customId: "b", cwd: "/r" });
  });
  it("agents render as cards with a signal line and a readiness dot", async () => {
    render(<SpawnDialog fetch={fakeFetch()} cwd="/r" onSpawned={vi.fn()} />);
    const card = (await screen.findByLabelText(/claude/)).parentElement!;
    expect(card.querySelector("[aria-hidden='true'].mark.mark-claude")!.textContent).toBe("C");
    expect(card.querySelector(".agent-meta")!.textContent).toBe("2.1.0 · hooks per session");
    expect(card.querySelector(".agent-dot")!.classList.contains("is-ready")).toBe(true);
    expect(screen.getByLabelText(/codex/).parentElement!.querySelector(".agent-meta")!.textContent).toBe("0.9.1 · notify");
    expect(screen.getByLabelText(/opencode/).parentElement!.querySelector(".agent-meta")!.textContent).toBe("plugin");
    const gemini = screen.getByLabelText(/gemini/).parentElement!;
    expect(gemini.querySelector(".agent-dot")!.classList.contains("is-ready")).toBe(false);
    expect(gemini.querySelector(".agent-status")!.textContent).toBe("not installed");
  });

  it("choosing New worktree shows the branch field and the .worktrees path preview", async () => {
    render(<SpawnDialog fetch={fakeFetch()} cwd="/Users/someone/code/r" base="dev" onSpawned={vi.fn()} />);
    await screen.findByLabelText(/claude/);
    const where = screen.getByRole("group", { name: "Where it runs" });
    expect((screen.getByLabelText(/Repo root/) as HTMLInputElement).checked).toBe(true);
    expect(where.textContent).toContain("~/code/r");
    expect(where.textContent).toContain("so two agents never edit the same files");
    expect(screen.queryByLabelText("branch name")).toBeNull();
    fireEvent.click(screen.getByLabelText("new worktree"));
    expect(where.querySelector(".chip")!.textContent).toBe("dev");
    fireEvent.change(screen.getByLabelText("branch name"), { target: { value: " feat-x " } });
    expect(where.querySelector(".wt-preview")!.textContent).toBe("→ .worktrees/feat-x");
  });

  it("⌘Enter submits the form", async () => {
    const fetch = fakeFetch();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/codex/));
    // jsdom's navigator.platform is empty, so the hint is the non-mac one.
    expect(screen.getByRole("button", { name: "Spawn" }).textContent).toContain("Ctrl↵");
    fireEvent.keyDown(screen.getByLabelText("first prompt"), { key: "Enter", metaKey: true });
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true));
  });

  it("⌘Enter does not submit while an IME is composing", async () => {
    const fetch = fakeFetch();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/codex/));
    expect(screen.getByRole("button", { name: "Spawn" }).getAttribute("aria-keyshortcuts")).toBe("Control+Enter");
    fireEvent.keyDown(screen.getByLabelText("first prompt"), { key: "Enter", metaKey: true, isComposing: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });
  it("on a mac the shortcut reads ⌘↵ and Meta+Enter", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(<SpawnDialog fetch={fakeFetch()} cwd="/r" onSpawned={vi.fn()} />);
    await screen.findByLabelText(/codex/);
    const spawn = screen.getByRole("button", { name: "Spawn" });
    expect(spawn.textContent).toContain("⌘↵");
    expect(spawn.getAttribute("aria-keyshortcuts")).toBe("Meta+Enter");
    vi.restoreAllMocks();
  });

  it("⌘Enter does not submit while Spawn is disabled", async () => {
    const fetch = fakeFetch();
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText(/codex/));
    fireEvent.click(screen.getByLabelText("new worktree"));
    fireEvent.keyDown(screen.getByLabelText("first prompt"), { key: "Enter", metaKey: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });

  it("the base branch comes from git status, with no chip while it is unknown", async () => {
    let answer!: (r: Response) => void;
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).startsWith("/api/git/status") ? new Promise<Response>((r) => (answer = r)) : json(agents),
    );
    render(<SpawnDialog fetch={fetch} cwd="/r" onSpawned={vi.fn()} />);
    await screen.findByLabelText(/claude/);
    expect(fetch).toHaveBeenCalledWith("/api/git/status?path=%2Fr");
    const where = screen.getByRole("group", { name: "Where it runs" });
    expect(where.querySelector(".chip")).toBeNull();
    expect(where.textContent).not.toContain("main");
    answer(json({ branch: "dev", ahead: 0, behind: 0, dirty: 0, lastCommit: null }));
    await waitFor(() => expect(where.querySelector(".chip")?.textContent).toBe("dev"));
    expect(where.querySelector(".where-path")!.getAttribute("title")).toBe("/r");
  });

  it("a custom card reads custom · regex needs-you", async () => {
    const custom = { id: "custom", command: "/bin/a", version: null, available: true, customId: "a", name: "Agent A" };
    render(<SpawnDialog fetch={vi.fn(async () => json([custom]))} cwd="/r" onSpawned={vi.fn()} />);
    const card = (await screen.findByLabelText(/Agent A/)).parentElement!;
    expect(card.querySelector(".agent-meta")!.textContent).toBe("custom · regex needs-you");
  });
});
