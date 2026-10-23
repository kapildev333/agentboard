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

it("commit posts the message", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/commit": () => json({ sha: "def" }) }, calls);
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Commit"));
  fireEvent.change(screen.getByLabelText("Commit message"), { target: { value: "fix it" } });
  fireEvent.click(screen.getByText("Submit"));
  await vi.waitFor(() => expect(calls.some(([k]) => k === "POST /api/git/commit")).toBe(true));
  const post = calls.find(([k]) => k === "POST /api/git/commit")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({ path: "/r", message: "fix it" });
});

it("a failed push shows the error", async () => {
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "POST /api/git/push": () => json({ error: "remote rejected" }, 500),
  });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  expect((await screen.findByRole("alert")).textContent).toBe("remote rejected");
});

it("open PR posts and opens the url", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const open = vi.fn();
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/pr": () => json({ url: "https://x/pr/1" }) }, calls);
  render(<GitCard fetch={fetch} path="/r" open={open} />);
  fireEvent.click(await screen.findByText("Open PR"));
  await vi.waitFor(() => expect(open).toHaveBeenCalledWith("https://x/pr/1"));
  expect(JSON.parse(calls.find(([k]) => k === "POST /api/git/pr")![1]!.body as string)).toEqual({ path: "/r", title: "wire the thing" });
});

it("a non-http PR url is not opened and shows an error", async () => {
  const open = vi.fn();
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/pr": () => json({ url: "javascript:alert(1)" }) });
  render(<GitCard fetch={fetch} path="/r" open={open} />);
  fireEvent.click(await screen.findByText("Open PR"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
});

it("a failing status shows the error", async () => {
  const fetch = router({ "GET /api/git/status": () => json({ error: "not a repo" }, 500) });
  render(<GitCard fetch={fetch} path="/r" />);
  expect((await screen.findByRole("alert")).textContent).toBe("not a repo");
});

it("a failing diff shows the error and diff headers are not marked", async () => {
  let fail = true;
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "GET /api/git/diff": () =>
      fail ? json({ error: "diff broke" }, 500) : json({ files: [], patch: "--- a/x\n+++ b/x\n+new" }),
  });
  const { unmount } = render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect(await screen.findByText("diff broke")).toBeTruthy();
  unmount();
  fail = false;
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect((await screen.findByText("+new")).className).toBe("added");
  expect(screen.getByText("--- a/x").className).toBe("");
});

it("the commit message is required", async () => {
  render(<GitCard fetch={router({ "GET /api/git/status": () => json(status) })} path="/r" />);
  fireEvent.click(await screen.findByText("Commit"));
  expect((screen.getByLabelText("Commit message") as HTMLInputElement).required).toBe(true);
});

it("a push error survives the next status refresh", async () => {
  let statusCalls = 0;
  const fetch = router({
    "GET /api/git/status": () => (statusCalls++, json(status)),
    "POST /api/git/push": () => json({ error: "remote rejected" }, 500),
  });
  render(<GitCard fetch={fetch} path="/r" intervalMs={20} />);
  fireEvent.click(await screen.findByText("Push"));
  await screen.findByText("remote rejected");
  const seen = statusCalls;
  await vi.waitFor(() => expect(statusCalls).toBeGreaterThan(seen + 1));
  expect(screen.getByRole("alert").textContent).toBe("remote rejected");
});

it("removed and added lines that start with -- or ++ are marked after the first hunk", async () => {
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "GET /api/git/diff": () => json({ files: [], patch: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n---\n+++ y" }),
  });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect((await screen.findByText("---")).className).toBe("removed");
  expect(screen.getByText("+++ y").className).toBe("added");
  expect(screen.getByText("--- a/x").className).toBe("");
});

it("a second file's --- and +++ headers stay unmarked after the first file's hunk", async () => {
  const patch = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/y b/y\n--- a/y\n+++ b/y\n@@ -1 +1 @@\n-a\n+b";
  const fetch = router({ "GET /api/git/status": () => json(status), "GET /api/git/diff": () => json({ files: [], patch }) });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect((await screen.findByText("--- a/y")).className).toBe("");
  expect(screen.getByText("+++ b/y").className).toBe("");
  expect(screen.getByText("+b").className).toBe("added");
});

it("a failing poll after a good status shows the alert and keeps the card", async () => {
  let calls = 0;
  const fetch = router({ "GET /api/git/status": () => (calls++ === 0 ? json(status) : json({ error: "gone" }, 500)) });
  render(<GitCard fetch={fetch} path="/r" intervalMs={20} />);
  expect((await screen.findByRole("alert")).textContent).toBe("gone");
  expect(screen.getByText(/feat-x/)).toBeTruthy();
});
