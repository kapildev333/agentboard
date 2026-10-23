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
  expect(screen.getByText(/behind 0/)).toBeTruthy();
  expect(screen.getByText(/dirty 3/)).toBeTruthy();
  expect(screen.getByText(/wire the thing/)).toBeTruthy();
});

type Call = [key: string, init: RequestInit | undefined, url: string];

const router = (routes: Record<string, () => Response>, calls: Call[] = []) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).split("?")[0]}`;
    calls.push([key, init, String(url)]);
    return routes[key]?.() ?? json({ error: "nope" }, 404);
  }) as typeof globalThis.fetch;

it("clicking Diff loads and renders the patch", async () => {
  const calls: Call[] = [];
  const fetch = router(
    {
      "GET /api/git/status": () => json(status),
      "GET /api/git/diff": () =>
        json({ files: [{ path: "a.ts", status: "M" }], patch: "@@ -1 +1 @@\n-old\n+new" }),
    },
    calls,
  );
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  expect(await screen.findByText("a.ts")).toBeTruthy();
  expect(calls.some(([, , url]) => url === "/api/git/diff?path=%2Fr")).toBe(true);
  expect(screen.getByText("M")).toBeTruthy();
  expect(screen.getByText("+new").className).toBe("added");
  expect(screen.getByText("-old").className).toBe("removed");
});

it("commit posts the message", async () => {
  const calls: Call[] = [];
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
  const calls: Call[] = [];
  const fetch = router(
    {
      "GET /api/git/status": () => json(status),
      "POST /api/git/push": () => json({ error: "remote rejected" }, 500),
    },
    calls,
  );
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  expect((await screen.findByRole("alert")).textContent).toBe("remote rejected");
  expect(JSON.parse(calls.find(([k]) => k === "POST /api/git/push")![1]!.body as string)).toEqual({ path: "/r" });
});

it("open PR posts and shows the url as a link, since a popup after the reply would be blocked (L21)", async () => {
  const calls: Call[] = [];
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/pr": () => json({ url: "https://x/pr/1" }) }, calls);
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Open PR"));
  const link = (await screen.findByRole("link", { name: "https://x/pr/1" })) as HTMLAnchorElement;
  expect(link.href).toBe("https://x/pr/1");
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  expect(JSON.parse(calls.find(([k]) => k === "POST /api/git/pr")![1]!.body as string)).toEqual({ path: "/r", title: "wire the thing" });
});

it("a non-http PR url is not linked and shows an error", async () => {
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/pr": () => json({ url: "javascript:alert('https://x')" }) });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Open PR"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
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

it("a reply that fails its schema shows an alert for status, diff and push", async () => {
  const empty = () => json({});
  const { unmount } = render(<GitCard fetch={router({ "GET /api/git/status": empty })} path="/r" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  unmount();

  const ok = router({ "GET /api/git/status": () => json(status), "GET /api/git/diff": empty, "POST /api/git/push": empty });
  render(<GitCard fetch={ok} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Diff"));
  await vi.waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
});

it("an action error clears after a good action", async () => {
  let ok = false;
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "POST /api/git/push": () => (ok ? json({ ok: true }) : json({ error: "remote rejected" }, 500)),
  });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  await screen.findByRole("alert");
  ok = true;
  fireEvent.click(screen.getByText("Push"));
  await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("a status error clears after a good poll", async () => {
  let calls = 0;
  const fetch = router({ "GET /api/git/status": () => (calls++ === 1 ? json({ error: "blip" }, 500) : json(status)) });
  render(<GitCard fetch={fetch} path="/r" intervalMs={20} />);
  await screen.findByRole("alert");
  await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("the commit form closes after a successful commit", async () => {
  const fetch = router({ "GET /api/git/status": () => json(status), "POST /api/git/commit": () => json({ sha: "def" }) });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Commit"));
  fireEvent.change(screen.getByLabelText("Commit message"), { target: { value: "fix it" } });
  fireEvent.click(screen.getByText("Submit"));
  await vi.waitFor(() => expect(screen.queryByLabelText("Commit message")).toBeNull());
});

it("polls every 10 s while mounted and stops on unmount", async () => {
  vi.useFakeTimers();
  try {
    let statusCalls = 0;
    const fetch = router({ "GET /api/git/status": () => (statusCalls++, json(status)) });
    const { unmount } = render(<GitCard fetch={fetch} path="/r" />);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(statusCalls).toBe(2);
    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(statusCalls).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});

it("a failed commit shows the error and keeps the message", async () => {
  const fetch = router({
    "GET /api/git/status": () => json(status),
    "POST /api/git/commit": () => json({ error: "nothing to commit" }, 500),
  });
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Commit"));
  fireEvent.change(screen.getByLabelText("Commit message"), { target: { value: "fix it" } });
  fireEvent.click(screen.getByText("Submit"));
  expect((await screen.findByRole("alert")).textContent).toBe("nothing to commit");
  expect((screen.getByLabelText("Commit message") as HTMLInputElement).value).toBe("fix it");
});

it("a double click on Push sends one request while the first is in flight (L21)", async () => {
  const calls: Call[] = [];
  let release!: () => void;
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push([`${init?.method ?? "GET"} ${String(url).split("?")[0]}`, init, String(url)]);
    if (init?.method === "POST") await new Promise<void>((r) => (release = r));
    return json(init?.method === "POST" ? { ok: true } : status);
  }) as typeof globalThis.fetch;
  render(<GitCard fetch={fetch} path="/r" />);
  const push = await screen.findByText("Push");
  fireEvent.click(push);
  fireEvent.click(push);
  fireEvent.click(screen.getByText("Open PR"));
  expect(calls.filter(([k]) => k.startsWith("POST"))).toHaveLength(1);
  release();
});

it("a successful commit or push reloads the status so the counts refresh (L21)", async () => {
  const calls: Call[] = [];
  const fetch = router(
    { "GET /api/git/status": () => json(status), "POST /api/git/commit": () => json({ sha: "def" }), "POST /api/git/push": () => json({ ok: true }) },
    calls,
  );
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  await vi.waitFor(() => expect(calls.filter(([k]) => k === "GET /api/git/status")).toHaveLength(2));
  fireEvent.click(screen.getByText("Commit"));
  fireEvent.change(screen.getByLabelText("Commit message"), { target: { value: "fix it" } });
  fireEvent.click(screen.getByText("Submit"));
  await vi.waitFor(() => expect(calls.filter(([k]) => k === "GET /api/git/status")).toHaveLength(3));
});

it("the action buttons are disabled while an action is in flight (L21)", async () => {
  let release!: () => void;
  const fetch = (async (_: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") await new Promise<void>((r) => (release = r));
    return json(init?.method === "POST" ? { ok: true } : status);
  }) as typeof globalThis.fetch;
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Push"));
  for (const name of ["Push", "Open PR"]) await vi.waitFor(() => expect((screen.getByText(name) as HTMLButtonElement).disabled).toBe(true));
  release();
  await vi.waitFor(() => expect((screen.getByText("Push") as HTMLButtonElement).disabled).toBe(false));
});
