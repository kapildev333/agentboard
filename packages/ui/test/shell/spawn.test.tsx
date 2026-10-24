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
    expect(document.activeElement).toBe(await screen.findByLabelText(/codex/));
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
});
