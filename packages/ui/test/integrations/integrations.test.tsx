import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IntegrationsPage } from "../../src/integrations";
import routes from "../../../shared/src/fixtures/routes.json";

// The reply the shared route table's example gives, so the page and the daemon agree on the shape.
const reply = routes["GET /api/integrations"].response;
// Two and a half minutes after the fixture's MCP call, the same evening as its refused one.
const now = () => new Date("2026-10-23T22:04:30.000Z");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function page(onBack = vi.fn()) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(reply)));
  render(<IntegrationsPage fetch={fetch} onBack={onBack} host="127.0.0.1:5123" now={now} />);
  return { fetch, onBack };
}

test("renders the three cards and the call log from the daemon's reply", async () => {
  page();
  expect(screen.getByRole("heading", { name: "Integrations" })).toBeTruthy();
  const command = screen.getByRole("region", { name: "The command" });
  for (const c of ["agentboard open [path]", "agentboard spawn <agent>", "agentboard note <text>", "agentboard status", "agentboard start"]) within(command).getByText(c);
  within(command).getByText(/"worktree"/);

  const mcp = screen.getByRole("region", { name: "MCP server" });
  for (const t of ["open_board", "spawn_console", "list_consoles", "add_note", "get_status"]) within(mcp).getByText(t);
  within(mcp).getByText("claude mcp add agentboard -- agentboard-mcp");
  expect(await within(mcp).findByText("last call 2 min ago")).toBeTruthy();
  fireEvent.click(within(mcp).getByRole("tab", { name: /codex/ }));
  within(mcp).getByText(/\[mcp_servers\.agentboard\]/);

  const plugins = screen.getByRole("region", { name: "Plugins" });
  within(plugins).getByText(/claude plugin install agentboard@agentboard/);
  within(plugins).getByText(/~\/\.config\/opencode\/plugins\//);
  expect(within(plugins).getAllByText("not seen yet")).toHaveLength(2);
  // No install button: the page observes, it never writes a CLI's config (D48).
  expect(within(plugins).queryByRole("button", { name: /install/i })).toBeNull();

  const log = screen.getByRole("region", { name: "Calls received by the daemon" });
  within(log).getByText(/127\.0\.0\.1:5123/);
  within(log).getByText(/1 refused today/);
  const refused = within(log).getByText("403 bad Origin").closest("tr")!;
  expect(refused.className).toContain("refused");
  within(refused).getByText("http://evil.example");
  expect(within(log).getByText("200").closest("tr")!.className).not.toContain("refused");
});

test("Copy puts the registration line on the clipboard and says so", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  page();
  const mcp = screen.getByRole("region", { name: "MCP server" });
  fireEvent.click(within(mcp).getByRole("button", { name: "Copy" }));
  expect(writeText).toHaveBeenCalledWith("claude mcp add agentboard -- agentboard-mcp");
  expect(await within(mcp).findByText("Copied")).toBeTruthy();
});

test("Copy without a clipboard, or with one that refuses, says to select the text", async () => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  page();
  const mcp = screen.getByRole("region", { name: "MCP server" });
  fireEvent.click(within(mcp).getByRole("button", { name: "Copy" }));
  expect(await within(mcp).findByText("Copy failed, select the text")).toBeTruthy();
  cleanup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) }, configurable: true });
  page();
  const again = screen.getByRole("region", { name: "MCP server" });
  fireEvent.click(within(again).getByRole("button", { name: "Copy" }));
  expect(await within(again).findByText("Copy failed, select the text")).toBeTruthy();
});

test("only the server's own refusals, which carry a reason, count as refused", async () => {
  const log = [
    { at: "2026-10-23T22:03:00.000Z", source: "cli", route: "POST /api/git/push", result: "403" },
    { at: "2026-10-23T22:03:10.000Z", source: "unknown", route: "GET /api/status", result: "401 no token" },
  ];
  const fetch = vi.fn(async () => new Response(JSON.stringify({ seen: {}, log })));
  render(<IntegrationsPage fetch={fetch} onBack={vi.fn()} host="127.0.0.1:5123" now={now} />);
  const region = screen.getByRole("region", { name: "Calls received by the daemon" });
  expect((await within(region).findByText("401 no token")).closest("tr")!.className).toContain("refused");
  expect(within(region).getByText("403").closest("tr")!.className).not.toContain("refused");
  within(region).getByText(/1 refused today/);
});

test("Back and Escape return to the board", () => {
  const { onBack } = page();
  fireEvent.click(screen.getByRole("button", { name: "← Back to board" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onBack).toHaveBeenCalledTimes(2);
});

test("re-reads the log every 5 s while open", async () => {
  vi.useFakeTimers();
  const { fetch } = page();
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/integrations");
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(fetch).toHaveBeenCalledTimes(2);
  cleanup();
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(fetch).toHaveBeenCalledTimes(2);
});
