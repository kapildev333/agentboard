import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { OpenInMenu, postOpen } from "../../src/open/OpenInButtons.js";

type Button = ReactElement<{ children: string; onClick: () => void }>;

// No DOM library is installed, so the menu is a plain element tree: find the buttons in it and click them.
function buttonsOf(menu: ReactElement): Button[] {
  const children = (menu.props as { children: unknown[] }).children;
  return children.filter((c): c is Button => typeof c === "object" && c !== null && (c as Button).type === "button");
}

test("clicking VS Code posts editor code and the path", () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const menu = OpenInMenu({ error: null, onOpen: (editor) => postOpen(editor, "/work/repo", doFetch) });
  buttonsOf(menu).find((b) => b.props.children === "VS Code")!.props.onClick();
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
