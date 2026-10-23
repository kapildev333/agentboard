import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GitCard } from "../../src/git";

afterEach(cleanup);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const status = { branch: "feat-x", ahead: 2, behind: 0, dirty: 3, lastCommit: { sha: "abc", subject: "wire the thing" } };

it("the card renders a status fixture", async () => {
  const fetch = async (url: string | URL | Request) => {
    expect(String(url)).toBe("/api/git/status?path=%2Fr");
    return json(status);
  };
  render(<GitCard fetch={fetch as typeof globalThis.fetch} path="/r" />);
  expect(await screen.findByText(/feat-x/)).toBeTruthy();
  expect(screen.getByText(/ahead 2/)).toBeTruthy();
  expect(screen.getByText(/dirty 3/)).toBeTruthy();
  expect(screen.getByText(/wire the thing/)).toBeTruthy();
});

const router = (routes: Record<string, () => Response>, calls: [string, RequestInit | undefined][] = []) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).split("?")[0]}`;
    calls.push([key, init]);
    return routes[key]?.() ?? json({ error: "nope" }, 404);
  }) as typeof globalThis.fetch;

it("clicking Diff loads and renders the patch", async () => {
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "GET /api/git/diff": () =>
      json({ files: [{ path: "a.ts", status: "M" }], patch: "@@ -1 +1 @@\n-old\n+new" }),
  });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect(await screen.findByText("a.ts")).toBeTruthy();
  expect(screen.getByText("M")).toBeTruthy();
  expect(screen.getByText("+new").className).toBe("added");
  expect(screen.getByText("-old").className).toBe("removed");
});
