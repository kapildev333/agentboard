import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GitCard } from "../src/git";
import { splitPatch } from "../src/git/DiffView";
import { formatAge } from "../src/git/GitCard";

afterEach(cleanup);

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

const status = { branch: "feat-x", ahead: 1, behind: 0, dirty: 3, lastCommit: { sha: "abcdef1234", subject: "wire the thing" } };
const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " keep",
  "-old a",
  "+new a",
  "+more a",
  "diff --git a/b.md b/b.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/b.md",
  "@@ -0,0 +1 @@",
  "+only b",
].join("\n");
const diff = { files: [{ path: "src/a.ts", status: "M" }, { path: "b.md", status: "A" }], patch };

const fetch = (async (url: string | URL | Request) =>
  json(String(url).startsWith("/api/git/diff") ? diff : status)) as typeof globalThis.fetch;

const openDiff = async () => {
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  return screen.findByRole("group", { name: "Changed files" });
};

it("the changed files list shows one row per file with added and removed counts", async () => {
  const list = await openDiff();
  const rows = within(list).getAllByRole("button");
  expect(rows.map((r) => r.textContent)).toEqual(["Msrc/a.ts+2 −1", "Ab.md+1 −0"]);
  expect(rows[0]!.getAttribute("aria-pressed")).toBe("true");
});

it("clicking the second file shows only its hunks", async () => {
  const list = await openDiff();
  expect(screen.getByText("+new a")).toBeTruthy();
  fireEvent.click(within(list).getByText("b.md"));
  expect(screen.getByText("+only b").className).toBe("added");
  expect(screen.queryByText("+new a")).toBeNull();
  expect(screen.getByText("unified · 1 hunk")).toBeTruthy();
});

it("each diff row carries its old and new line numbers", async () => {
  await openDiff();
  const gutters = (text: string) => [...screen.getByText(text).querySelectorAll(".diff-ln")].map((g) => g.textContent);
  expect(gutters("keep")).toEqual(["1", "1"]);
  expect(gutters("-old a")).toEqual(["2", ""]);
  expect(gutters("+more a")).toEqual(["", "3"]);
});

it("each file button names the path, the change and the counts", async () => {
  const list = await openDiff();
  expect(within(list).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
    "src/a.ts, modified, 2 added, 1 removed",
    "b.md, added, 1 added, 0 removed",
  ]);
});

const openWith = async (files: { path: string; status: string }[], patch: string) => {
  const f = (async (url: string | URL | Request) =>
    json(String(url).startsWith("/api/git/diff") ? { files, patch } : status)) as typeof globalThis.fetch;
  render(<GitCard fetch={f} path="/r" />);
  fireEvent.click(await screen.findByText("Diff"));
  return screen.findByRole("group", { name: "Changed files" });
};

it("a deleted file counts its removed lines and a binary file keeps its header lines without counts", async () => {
  const list = await openWith(
    [{ path: "old.txt", status: "D" }, { path: "logo.png", status: "M" }],
    [
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "--- a/old.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-one",
      "-two",
      "diff --git a/logo.png b/logo.png",
      "index 1111111..2222222 100644",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n"),
  );
  const rows = within(list).getAllByRole("button");
  expect(rows.map((r) => r.textContent)).toEqual(["Dold.txt+0 −2", "Mlogo.png"]);
  fireEvent.click(rows[1]!);
  expect(screen.getByText("Binary files a/logo.png and b/logo.png differ")).toBeTruthy();
  expect(screen.queryByText(/unified/)).toBeNull();
});

it("a quoted non-ASCII path is unquoted, matched and counted", async () => {
  const list = await openWith(
    [{ path: '"caf\\303\\251.md"', status: "M" }],
    ['diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"', '--- "a/caf\\303\\251.md"', '+++ "b/caf\\303\\251.md"', "@@ -1 +1 @@", "-a", "+b"].join("\n"),
  );
  expect(within(list).getByRole("button").textContent).toBe("Mcafé.md+1 −1");
  expect(splitPatch('diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"\n@@ -1 +1 @@')[0]!.path).toBe("café.md");
});

it("the commit form is a textarea whose button counts the dirty files", async () => {
  render(<GitCard fetch={fetch} path="/r" />);
  fireEvent.click(await screen.findByText("Commit"));
  expect(screen.getByLabelText("Commit message").tagName).toBe("TEXTAREA");
  expect((screen.getByText("Commit 3 files") as HTMLButtonElement).type).toBe("submit");
});

it("the head row shows the base after from, and leaves from out without one", async () => {
  const { unmount } = render(<GitCard fetch={fetch} path="/r" base="main" />);
  expect(await screen.findByText("from")).toBeTruthy();
  expect(screen.getByText("main")).toBeTruthy();
  expect(screen.getByText("abcdef1")).toBeTruthy();
  unmount();
  render(<GitCard fetch={fetch} path="/r" />);
  await screen.findByText("feat-x");
  expect(screen.queryByText("from")).toBeNull();
});

it("the age formatter gives minutes, hours, then days", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  expect(formatAge("2026-10-23T11:48:00Z", now)).toBe("12m");
  expect(formatAge("2026-10-23T09:00:00Z", now)).toBe("3h");
  expect(formatAge("2026-10-21T12:00:00Z", now)).toBe("2d");
  expect(formatAge("2026-10-23T12:00:30Z", now)).toBe("0m");
});
