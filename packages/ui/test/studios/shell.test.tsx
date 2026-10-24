import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { Board } from "@agentboard/shared";
import { App } from "../../src/app";
import { useBoard } from "../../src/board";
import type { SocketLike } from "../../src/console";
import { headings, renderMarkdown } from "../../src/studios/markdown";

vi.mock("../../src/console", () => ({ ConsoleNode: () => <div /> }));

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

const board: Board = {
  version: 1,
  repoPath: "/r",
  activeWorkspaceId: "main",
  workspaces: [{ id: "main", name: "main", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] }],
};
const json = (body: unknown) => new Response(JSON.stringify(body));
const fetch = vi.fn(async (url: string | URL | Request) =>
  String(url).startsWith("/api/board") ? json(board) : String(url) === "/api/settings" ? json({ fontSize: 13, customAgents: [] }) : json({ ok: true }),
);
const socket = (): SocketLike => ({ readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} });

beforeEach(() => {
  useBoard.getState().setBoard({ ...board, repoPath: "" });
  location.hash = "";
});
afterEach(cleanup);

const setHash = (h: string) => act(() => {
  location.hash = h;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
});

test("#/code shows the Code stub and hides the board; clearing the hash brings the board back; the mission map stays", async () => {
  const { container } = render(<App fetch={fetch} search="?repo=%2Fr" connect={socket} />);
  await waitFor(() => expect(container.querySelector(".react-flow")).not.toBeNull());
  setHash("#/code");
  expect(screen.getByRole("heading", { level: 1, name: "Code" })).toBeTruthy();
  expect(screen.getByText("Coming in lane L62")).toBeTruthy();
  expect(container.querySelector(".react-flow")).toBeNull();
  expect(screen.getByRole("complementary", { name: "Mission map" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Code" }).getAttribute("aria-current")).toBe("page");
  setHash("");
  await waitFor(() => expect(container.querySelector(".react-flow")).not.toBeNull());
  expect(screen.queryByRole("heading", { level: 1, name: "Code" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Mission map" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-current")).toBe("page");
});

test("the Studios nav switches by hash", async () => {
  render(<App fetch={fetch} search="?repo=%2Fr" connect={socket} />);
  const nav = await screen.findByRole("navigation", { name: "Studios" });
  expect([...nav.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Board", "Document", "Diagram", "Code", "Vault"]);
  fireEvent.click(screen.getByRole("button", { name: "Vault" }));
  expect(location.hash).toBe("#/vault");
  expect(await screen.findByRole("heading", { level: 1, name: "Vault" })).toBeTruthy();
});

test("renderMarkdown escapes HTML in the source", () => {
  const html = renderMarkdown("# Hi\n\n<script>alert(1)</script> <b>x</b>");
  expect(html).toContain("<h1");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<b>");
  expect(html).toContain("&lt;script&gt;");
});

test("headings lists levels, text and 1-based lines, skipping fenced code", () => {
  expect(headings("# A\n\n## B\n```\n# not\n```\n### C")).toEqual([
    { level: 1, text: "A", line: 1 },
    { level: 2, text: "B", line: 3 },
    { level: 3, text: "C", line: 7 },
  ]);
});
