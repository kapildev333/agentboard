import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { OpenInButtons } from "../../src/open/OpenInButtons.js";

afterEach(cleanup);

test("clicking VS Code posts editor code and the path", () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  render(<OpenInButtons path="/work/repo" doFetch={doFetch} />);
  fireEvent.click(screen.getByRole("button", { name: "VS Code" }));
  expect(sent).toEqual([
    {
      url: "/api/open",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editor: "code", path: "/work/repo" }),
      },
    },
  ]);
});

test("a daemon error shows as one line inline", async () => {
  const doFetch = (async () =>
    new Response(JSON.stringify({ error: 'not a directory: "/x"' }), { status: 400 })) as typeof fetch;
  render(<OpenInButtons path="/x" doFetch={doFetch} />);
  fireEvent.click(screen.getByRole("button", { name: "Zed" }));
  expect((await screen.findByRole("alert")).textContent).toBe('not a directory: "/x"');
});
