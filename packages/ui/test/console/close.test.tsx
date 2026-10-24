import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Board, ConsoleNode, GitStatus, Settings } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";

// xterm does not run in jsdom; the terminal has its own tests.
vi.mock("../../src/console", () => ({ ConsoleNode: ({ data }: { data: { node: { title: string } } }) => <div>{data.node.title}</div> }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
  } as never;
});
afterEach(cleanup);

const worktree = { path: "/r/.worktrees/fix-tax", branch: "fix/tax", base: "main" };
const node = (withWorktree = true): ConsoleNode => ({
  id: "c1",
  type: "console",
  title: "Tax fix",
  x: 0,
  y: 0,
  w: 520,
  h: 340,
  agent: "codex",
  cwd: withWorktree ? worktree.path : "/r",
  ...(withWorktree && { worktree }),
  status: "needs_you",
  createdAt: "2026-10-23T09:00:00.000Z",
  lastActiveAt: "2026-10-23T09:00:00.000Z",
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const clean: GitStatus = { branch: "fix/tax", ahead: 0, behind: 0, dirty: 0, unpushed: 0, lastCommit: null };
const dirty: GitStatus = { ...clean, ahead: 1, dirty: 2, unpushed: 1 };

type Call = { url: string; method: string; body?: unknown };
function setup(opts: { withWorktree?: boolean; status?: GitStatus; settings?: Partial<Settings>; remove?: Response } = {}) {
  const calls: Call[] = [];
  const board: Board = {
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "main",
    workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [node(opts.withWorktree ?? true)] }],
  };
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET";
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.startsWith("/api/board") && method === "GET") return json(board);
    if (u === "/api/settings" && method === "GET") return json({ fontSize: 13, customAgents: [], ...opts.settings });
    if (u.startsWith("/api/git/status")) return json(opts.status ?? dirty);
    if (u.startsWith("/api/git/diff")) return json({ files: [{ path: "a.ts", status: "M" }], patch: "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n" });
    if (u === "/api/git/worktree") return opts.remove ?? json({ ok: true });
    return json({ ok: true, rev: 1 });
  });
  const socket: SocketLike = { readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} } as never;
  render(<App fetch={fetch as typeof globalThis.fetch} search="?repo=/r" connect={() => socket} />);
  const deletes = () => calls.filter((c) => c.method === "DELETE");
  return { calls, deletes };
}
const onBoard = () => useBoard.getState().board.workspaces[0]!.nodes.some((n) => n.id === "c1");
const clickClose = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Close Tax fix" }));
};

it("a console without a worktree closes exactly as today, with no dialog and no git call", async () => {
  const { calls, deletes } = setup({ withWorktree: false });
  await clickClose();
  await waitFor(() => expect(deletes()).toEqual([{ url: "/api/consoles/c1", method: "DELETE", body: undefined }]));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(calls.some((c) => c.url.startsWith("/api/git"))).toBe(false);
});

it("a dirty worktree opens the dialog with its path, branch and chips, Keep selected and focus inside", async () => {
  setup({ status: dirty });
  await clickClose();
  const dialog = await screen.findByRole("alertdialog", { name: "Close “Tax fix”?" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const desc = document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent!;
  expect(desc).toMatch(/SIGHUP/);
  expect(desc).toMatch(/SIGKILL after 5 seconds/);
  expect(desc).toMatch(/approval prompt.*not applied/);
  const d = within(dialog);
  expect(d.getByText(/\.worktrees\/fix-tax/)).toBeTruthy();
  expect(d.getByText("fix/tax")).toBeTruthy();
  expect(d.getByText("2 uncommitted files")).toBeTruthy();
  expect(d.getByText("1 commit not pushed")).toBeTruthy();
  expect(d.getByText("base main")).toBeTruthy();
  expect(d.getByRole("group", { name: "What happens to the worktree" })).toBeTruthy();
  expect((d.getByRole("radio", { name: /Keep it/ }) as HTMLInputElement).checked).toBe(true);
  expect(d.getByRole("radio", { name: /Remove worktree and delete branch/ }).closest("label")!.textContent).toMatch(/git worktree remove --force.*git branch -D fix\/tax/);
  expect(d.getByRole("button", { name: "Close console, keep worktree" })).toBeTruthy();
  expect(dialog.contains(document.activeElement)).toBe(true);
});

it("a clean worktree shows only the base chip and still asks, Keep selected", async () => {
  setup({ status: clean });
  await clickClose();
  const d = within(await screen.findByRole("alertdialog"));
  expect(d.queryByText(/uncommitted/)).toBeNull();
  expect(d.queryByText(/not pushed/)).toBeNull();
  expect(d.getByText("base main")).toBeTruthy();
  expect((d.getByRole("radio", { name: /Keep it/ }) as HTMLInputElement).checked).toBe(true);
  expect(d.getByRole("radio", { name: /Remove worktree/ }).closest("label")!.textContent).not.toMatch(/--force/);
});

it("Keep it closes the console and leaves the worktree alone", async () => {
  const { deletes } = setup();
  await clickClose();
  fireEvent.click(await screen.findByRole("button", { name: "Close console, keep worktree" }));
  await waitFor(() => expect(deletes()).toEqual([{ url: "/api/consoles/c1", method: "DELETE", body: undefined }]));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(onBoard()).toBe(false);
});

it("Remove, confirmed with Enter, closes the console first and then removes the worktree and branch", async () => {
  const { deletes } = setup({ status: clean });
  await clickClose();
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("radio", { name: /Remove worktree/ }));
  expect(within(dialog).getByRole("button", { name: "Close console, remove worktree" })).toBeTruthy();
  fireEvent.keyDown(dialog, { key: "Enter" });
  await waitFor(() => expect(onBoard()).toBe(false));
  expect(deletes()[0]).toMatchObject({ url: "/api/consoles/c1" });
  expect(deletes()[1]).toEqual({ url: "/api/git/worktree", method: "DELETE", body: { repo: "/r", path: worktree.path, branch: worktree.branch, deleteBranch: true, force: false } });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

it("Remove on a dirty worktree forces it", async () => {
  const { deletes } = setup({ status: dirty });
  await clickClose();
  fireEvent.click(await screen.findByRole("radio", { name: /Remove worktree/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close console, remove worktree" }));
  await waitFor(() => expect(deletes().find((c) => c.url === "/api/git/worktree")?.body).toMatchObject({ force: true }));
  await waitFor(() => expect(onBoard()).toBe(false)); // so no close is still in flight when the next test starts
});

it("a refusal shows inline as an alert and the console stays on the board", async () => {
  setup({ status: clean, remove: json({ error: "worktree has uncommitted changes" }, 409) });
  await clickClose();
  fireEvent.click(await screen.findByRole("radio", { name: /Remove worktree/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close console, remove worktree" }));
  const dialog = screen.getByRole("alertdialog");
  expect((await within(dialog).findByRole("alert")).textContent).toMatch(/uncommitted changes/);
  expect(onBoard()).toBe(true);
});

it("Show me the diff first closes the dialog and opens the git card with the diff; the console stays", async () => {
  const { calls, deletes } = setup();
  await clickClose();
  fireEvent.click(await screen.findByRole("radio", { name: /Show me the diff first/ }));
  fireEvent.click(screen.getByRole("button", { name: "Show the diff" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(await screen.findByText(/dirty 2/)).toBeTruthy();
  await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/git/diff"))).toBe(true));
  expect(deletes()).toEqual([]);
  expect(onBoard()).toBe(true);
});

it("Esc and Cancel close the dialog, nothing is removed, and focus returns to the board", async () => {
  const { deletes } = setup();
  await clickClose();
  fireEvent.keyDown(await screen.findByRole("alertdialog"), { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close Tax fix" }));
  await clickClose();
  fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(deletes()).toEqual([]);
});

it("Don't ask again is saved in the settings file", async () => {
  const { calls } = setup();
  await clickClose();
  fireEvent.click(await screen.findByRole("checkbox", { name: /Don't ask again for clean worktrees/ }));
  await waitFor(() =>
    expect(calls).toContainEqual({ url: "/api/settings", method: "PUT", body: { fontSize: 13, customAgents: [], closeCleanWorktreesWithoutAsking: true } }),
  );
});

it("with the setting on, a clean worktree closes and is removed with no dialog", async () => {
  const { deletes } = setup({ status: clean, settings: { closeCleanWorktreesWithoutAsking: true } });
  await act(async () => {}); // the settings load
  await clickClose();
  // The board subscription's own DELETE of the departed node follows; the daemon answers it 404.
  await waitFor(() => expect(deletes().map((c) => c.url).slice(0, 2)).toEqual(["/api/consoles/c1", "/api/git/worktree"]));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(onBoard()).toBe(false);
});

it("with the setting on, a dirty worktree still asks", async () => {
  const { deletes } = setup({ status: dirty, settings: { closeCleanWorktreesWithoutAsking: true } });
  await act(async () => {});
  await clickClose();
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  expect(deletes()).toEqual([]);
});
