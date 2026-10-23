import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
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
