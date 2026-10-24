import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { Board, WebTileNode } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { WebTileView, webtileAdds } from "../src/webtile";

const node: WebTileNode = { id: "w1", type: "webtile", title: "Web", x: 0, y: 0, w: 400, h: 300, url: "http://localhost:3000" };
const notFound = (async () => new Response("", { status: 404 })) as typeof globalThis.fetch;
const setup = (n = node, fetch = notFound) => {
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [{ id: "a", name: "A", viewport: { x: 0, y: 0, zoom: 1 }, nodes: [n] }],
  } as Board);
  // Like the board, hand the view whatever node the store holds now.
  const Harness = () => {
    const live = useBoard((s) => s.board.workspaces[0]!.nodes[0]) as WebTileNode;
    return <WebTileView {...({ data: { node: live } } as unknown as NodeProps)} fetch={fetch} />;
  };
  return render(<Harness />);
};
const frame = () => screen.getByTitle(/localhost|127\.0\.0\.1/) as HTMLIFrameElement;
const post = (data: unknown, o: { origin?: string; source?: unknown } = {}) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin: o.origin ?? location.origin, source: (o.source ?? frame().contentWindow) as MessageEventSource }));
  });

afterEach(cleanup);

it("renders an iframe on the node's url", () => {
  setup();
  expect(frame().getAttribute("src")).toBe("http://localhost:3000");
  expect(frame().getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
  expect(screen.getByRole("link", { name: "Open" }).getAttribute("target")).toBe("_blank");
});

it("a console message from the tile's frame appears in the Inspector", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  post({ agentboard: "console", level: "error", text: "boom" });
  expect(screen.getByText("boom")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Inspector/ }).textContent).toContain("1");
});

it("a message from another origin is ignored", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  post({ agentboard: "console", level: "log", text: "evil" }, { origin: "http://evil.test" });
  post({ agentboard: "console", level: "log", text: "stranger" }, { source: window });
  expect(screen.queryByText("evil")).toBeNull();
  expect(screen.queryByText("stranger")).toBeNull();
});

it("network messages fill the Network tab and Clear empties it", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  post({ agentboard: "network", method: "GET", url: "/api/x", status: 200, ms: 12 });
  fireEvent.click(screen.getByRole("tab", { name: "Network" }));
  expect(screen.getByText("/api/x")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.queryByText("/api/x")).toBeNull();
});

it("keeps the last 200 console lines", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  for (let i = 0; i < 205; i++) post({ agentboard: "console", level: "log", text: `line${i}` });
  expect(screen.queryByText("line4")).toBeNull();
  expect(screen.getByText("line5")).toBeTruthy();
});

it("refuses a non-localhost url and saves a new one on Enter or blur", () => {
  setup();
  const input = screen.getByLabelText("Address");
  fireEvent.change(input, { target: { value: "http://example.com" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByText("Only localhost URLs load here")).toBeTruthy();
  expect(screen.queryByTitle(/example/)).toBeNull();
  fireEvent.change(input, { target: { value: "http://127.0.0.1:5173/" } });
  fireEvent.blur(input);
  expect(useBoard.getState().board.workspaces[0]!.nodes[0]).toMatchObject({ url: "http://127.0.0.1:5173/" });
});

it("Reload remounts the iframe", () => {
  setup();
  const before = frame();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(frame()).not.toBe(before);
});

it("Capture shows once /api/preview answers and routes through the proxy", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ key: "k1" }))) as unknown as typeof globalThis.fetch;
  setup(node, fetch);
  fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
  expect(frame().getAttribute("src")).toBe(`/preview/k1/${encodeURIComponent("http://localhost:3000")}`);
});

it("in Capture mode the frame loses allow-same-origin and its null-origin messages count only from the frame", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ key: "k1" }))) as unknown as typeof globalThis.fetch;
  setup(node, fetch);
  fireEvent.click(await screen.findByRole("button", { name: "Capture" }));
  expect(frame().getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  post({ agentboard: "console", level: "log", text: "sandboxed" }, { origin: "null" });
  post({ agentboard: "console", level: "log", text: "impostor" }, { origin: "null", source: window });
  expect(screen.getByText("sandboxed")).toBeTruthy();
  expect(screen.queryByText("impostor")).toBeNull();
});

it("a null-origin message is ignored when Capture is off", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Inspector/ }));
  post({ agentboard: "console", level: "log", text: "nullish" }, { origin: "null" });
  expect(screen.queryByText("nullish")).toBeNull();
});

it("shows no Open link for a non-localhost url", () => {
  setup({ ...node, url: "http://example.com" });
  expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
});

it("hides Capture when /api/preview answers 204 or other non-200", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof globalThis.fetch;
  setup(node, fetch);
  await act(async () => {});
  expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
});

it("webtileAdds makes a webtile node at the position", () => {
  expect(webtileAdds[0]!.label).toBe("Web tile");
  expect(webtileAdds[0]!.create({ x: 5, y: 6 })).toMatchObject({ type: "webtile", url: "http://localhost:3000", x: 5, y: 6 });
});
