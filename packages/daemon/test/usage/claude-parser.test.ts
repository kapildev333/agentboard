import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseClaude } from "../../src/usage/parsers/claude.js";

const fixture = (rel: string) => readFileSync(fileURLToPath(new URL(`fixtures/claude/${rel}`, import.meta.url)), "utf8");

test("the fixture's totals equal the hand-summed numbers exactly", () => {
  const sessions = [
    "-work-demo-shop/aaaaaaaa-0000-4000-8000-000000000001.jsonl",
    "-work-demo-shop/aaaaaaaa-0000-4000-8000-000000000002.jsonl",
    "-work-demo-api/aaaaaaaa-0000-4000-8000-000000000003.jsonl",
  ].flatMap((f) => parseClaude(fixture(f)) ?? []);
  // Input counts cache creation: 10 + 500 + 20 (the repeated msg_a2 line counts once); 5 + 7; 3.
  expect(sessions.map(({ turns: _, ...s }) => s)).toEqual([
    { agent: "claude", id: "aaaaaaaa-0000-4000-8000-000000000001", cwd: "/work/demo/shop", start: Date.parse("2026-10-20T08:59:00.000Z"), end: Date.parse("2026-10-20T09:30:00.000Z"), input: 530, output: 300, cacheRead: 1000 },
    { agent: "claude", id: "aaaaaaaa-0000-4000-8000-000000000002", cwd: "/work/demo/shop", start: Date.parse("2026-10-21T14:00:00.000Z"), end: Date.parse("2026-10-21T14:10:00.000Z"), input: 12, output: 120, cacheRead: 0 },
    { agent: "claude", id: "aaaaaaaa-0000-4000-8000-000000000003", cwd: "/work/demo/api", start: Date.parse("2026-10-22T08:00:00.000Z"), end: Date.parse("2026-10-22T08:00:00.000Z"), input: 3, output: 30, cacheRead: 0 },
  ]);
  const sum = (k: "input" | "output" | "cacheRead") => sessions.reduce((n, s) => n + s[k], 0);
  expect([sum("input"), sum("output"), sum("cacheRead")]).toEqual([545, 450, 1000]);
  // One turn per distinct message, each carrying its input + output + cache read.
  expect(sessions[0]!.turns).toEqual([[Date.parse("2026-10-20T09:00:00.000Z"), 610], [Date.parse("2026-10-20T09:30:00.000Z"), 1220]]);
});

test("a file that is not a claude log is not recognised", () => {
  expect(parseClaude('{"hello":"world"}\n')).toBeNull();
});
