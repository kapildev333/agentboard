import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GitCard } from "../src/git";

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
