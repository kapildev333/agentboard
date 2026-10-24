import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseCodex } from "../../src/usage/parsers/codex.js";
import { parseGemini } from "../../src/usage/parsers/gemini.js";
import { parseOpencode } from "../../src/usage/parsers/opencode.js";

const fixture = (rel: string) => readFileSync(fileURLToPath(new URL(`fixtures/${rel}`, import.meta.url)), "utf8");
const t = Date.parse;

test("codex: the last running total gives the session, its increases give the turns", () => {
  const [s, ...rest] = parseCodex(fixture("codex/2026/10/21/rollout-2026-10-21T10-00-00-cccccccc-0000-4000-8000-000000000001.jsonl"), "")!;
  expect(rest).toEqual([]);
  // input_tokens holds the cached part: 2500 - 1400 fresh; the repeated 10:01:01 total adds no turn.
  expect(s).toEqual({
    agent: "codex", id: "cccccccc-0000-4000-8000-000000000001", cwd: "/work/demo/api",
    start: t("2026-10-21T10:00:00.000Z"), end: t("2026-10-21T10:05:00.000Z"), input: 1100, output: 300, cacheRead: 1400,
    turns: [[t("2026-10-21T10:01:00.000Z"), 1100], [t("2026-10-21T10:05:00.000Z"), 1700]],
  });
});

test("gemini: a chat file carries tokens, logs.json only bounds the session", () => {
  const [chat] = parseGemini(fixture("gemini/0f0f0f/chats/session-2026-10-22T11-00-gggggggg.json"), "x/chats/session-1.json")!;
  // input holds the cached part: 900 - 300 + 1200.
  expect(chat).toEqual({
    agent: "gemini", id: "gggggggg-0000-4000-8000-000000000001", cwd: "",
    start: t("2026-10-22T11:00:00.000Z"), end: t("2026-10-22T11:21:00.000Z"), input: 1800, output: 200, cacheRead: 300,
    turns: [[t("2026-10-22T11:01:00.000Z"), 980], [t("2026-10-22T11:21:00.000Z"), 1320]],
  });
  const [log] = parseGemini(fixture("gemini/0f0f0f/logs.json"), "x/logs.json")!;
  expect(log).toMatchObject({ id: chat!.id, start: t("2026-10-22T11:00:00.000Z"), end: t("2026-10-22T11:20:00.000Z"), input: 0, turns: [] });
  expect(parseGemini('{"other":1}', "x/settings.json")).toBeNull();
});

test("opencode: an assistant message file carries tokens and cwd, a session file the directory", () => {
  expect(parseOpencode(fixture("opencode/storage/message/ses_demo1/msg_2.json"), "storage/message/ses_demo1/msg_2.json")).toEqual([{
    agent: "opencode", id: "ses_demo1", cwd: "/work/demo/web", start: 1761130860000, end: 1761130900000,
    input: 110, output: 40, cacheRead: 200, turns: [[1761130860000, 350]],
  }]);
  expect(parseOpencode(fixture("opencode/storage/message/ses_demo1/msg_1.json"), "storage/message/ses_demo1/msg_1.json"))
    .toEqual([{ agent: "opencode", id: "ses_demo1", cwd: "", start: 1761130800000, end: 1761130800000, input: 0, output: 0, cacheRead: 0, turns: [] }]);
  expect(parseOpencode(fixture("opencode/storage/session/proj1/ses_demo1.json"), "storage/session/proj1/ses_demo1.json"))
    .toEqual([{ agent: "opencode", id: "ses_demo1", cwd: "/work/demo/web", start: 1761130800000, end: 1761131400000, input: 0, output: 0, cacheRead: 0, turns: [] }]);
  expect(parseOpencode('{"id":"x"}', "storage/project/x.json")).toBeNull();
});
