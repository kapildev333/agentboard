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
});
