import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BoardSnapshotSchema } from "@agentboard/shared";
import { parseRules } from "../../src/command/rules.js";

const snapshot = BoardSnapshotSchema.parse(
  JSON.parse(readFileSync(new URL("../../../shared/src/fixtures/snapshot.json", import.meta.url), "utf8")),
);

test("close the two idle consoles and resume the docs pass", () => {
  const steps = parseRules("close the two idle consoles and resume the docs pass", snapshot);
  expect(steps).toMatchObject([
    { kind: "close", consoleIds: ["c-ci", "c-lint"], asks: true },
    { kind: "resume", consoleId: "c-docs", asks: false },
  ]);
});

const ci = "c-ci", lint = "c-lint", docs = "c-docs", checkout = "c-checkout";
const table: [string, object[]][] = [
  [
    "spawn a codex console in a worktree from main to fix the flaky cart test, next to Checkout flow",
    [{ kind: "spawn", agent: "codex", worktree: "fix/flaky-cart-test", prompt: expect.stringContaining("flaky cart test"), near: checkout, asks: false }],
  ],
  ["fit all consoles", [{ kind: "fit", asks: false }]],
  ["Fit all", [{ kind: "fit" }]],
  ["show everything", [{ kind: "fit" }]],
  ["focus the one that needs me", []],
  ["tell checkout flow to run the tests", [{ kind: "input", consoleId: checkout, text: "run the tests", asks: true }]],
  ["add a note deploy at 5", [{ kind: "note", text: "deploy at 5", asks: false }]],
  ["note: Ship it before Friday!", [{ kind: "note", text: "Ship it before Friday" }]],
  ["close the idle ones", [{ kind: "close", consoleIds: [ci, lint] }]],
  ["kill CI cleanup and lint sweep", [{ kind: "close", consoleIds: [ci, lint] }]],
  ["close the three idle consoles", []],
  ["stop the lint console", [{ kind: "close", consoleIds: [lint] }]],
  ["close the stopped console", [{ kind: "close", consoleIds: [docs] }]],
  ["close the exited one", []],
  ["close all", [{ kind: "close", consoleIds: [checkout, ci, lint, docs] }]],
  ["close the opencode console", [{ kind: "close", consoleIds: [ci] }]],
  ["focus the codex console", []],
  ["restart the docs pass", [{ kind: "resume", consoleId: docs }]],
  ["wake the stopped console", [{ kind: "resume", consoleId: docs }]],
  ["go to checkout", [{ kind: "focus", consoleId: checkout }]],
  ["jump to the ci one", [{ kind: "focus", consoleId: ci }]],
  ["show me the docs console", [{ kind: "focus", consoleId: docs }]],
  ["focus cleanup", [{ kind: "focus", consoleId: ci }]],
  ["type npm test into Lint sweep", [{ kind: "input", consoleId: lint, text: "npm test", asks: true }]],
  ["ask the docs pass to update the README", [{ kind: "input", consoleId: docs, text: "update the README" }]],
  ['start claude "add a dark mode toggle"', [{ kind: "spawn", agent: "claude", prompt: "add a dark mode toggle" }]],
  ["open gemini beside docs pass", [{ kind: "spawn", agent: "gemini", near: docs }]],
  ["launch claude in worktree spike-search", [{ kind: "spawn", agent: "claude", worktree: "spike-search" }]],
  ["spawn claude in a worktree to add a settings page for themes", [{ kind: "spawn", agent: "claude", worktree: "add-settings-page-themes" }]],
  ["spawn codex on branch fix/login to fix the login bug", [{ kind: "spawn", agent: "codex", worktree: "fix/login", prompt: "fix the login bug" }]],
  ["spawn a frobnicator console", []],
  ["make me a sandwich", []],
  [
    "fit all, then focus checkout flow and close the stopped console",
    [{ kind: "fit" }, { kind: "focus", consoleId: checkout }, { kind: "close", consoleIds: [docs] }],
  ],
  ["spawn claude to fix the cart and the checkout", [{ kind: "spawn", agent: "claude", prompt: "fix the cart and the checkout" }]],
];

test.each(table)("%s", (text, expected) => {
  expect(parseRules(text, snapshot)).toMatchObject(expected);
  expect(parseRules(text, snapshot)).toHaveLength(expected.length);
});

test("a spawn step names an unavailable agent in its detail and keeps the base", () => {
  const [step] = parseRules("spawn codex in a worktree from main to fix the flaky cart test", snapshot);
  expect(step).toMatchObject({ kind: "spawn", detail: "From main. codex is not available on this machine." });
});

test("every step gets a fresh id, the shared summary and asks from its kind", () => {
  const [a] = parseRules("close the idle ones", snapshot);
  const [b] = parseRules("close the idle ones", snapshot);
  expect(a!.id).not.toBe(b!.id);
  expect(a!.summary).toBe("Close CI cleanup and Lint sweep");
});
