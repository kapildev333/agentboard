import type { HandoffBrief } from "@agentboard/shared";
import type { Turn } from "./transcript.js";

export type DiffStat = { files: number; added: number; removed: number };

const RESULT = /(\d+) (passed|failed|passing|failing)/;
const LEFT = /\b(left|next|todo|to-do|remaining)\b/i;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)/;
const DECISION = /\b(decided|chose|did not|instead)\b/i;

// Deterministic, no model call (P4-D47): the user edits the brief before it is sent.
export function extractBrief(turns: Turn[], diffStat: DiffStat | null): HandoffBrief {
  const done = new Set<string>();
  turns.forEach((t, i) => {
    for (const f of t.tool?.files ?? []) done.add(`Edited ${f}`);
    if (t.tool?.name !== "Bash" || !/test/.test(t.text)) return;
    // The result is the last matching line of the command's output, the summary line of most runners.
    const out = turns[i + 1] && !turns[i + 1]!.tool ? turns[i + 1]!.text : "";
    const line = out.split("\n").filter((l) => RESULT.test(l)).pop();
    if (line) done.add(`Ran ${t.text.trim()}: ${line.trim().replace(/\s+/g, " ")}`);
  });
  if (!done.size && diffStat?.files) done.add(`Changed ${diffStat.files} files (+${diffStat.added} -${diffStat.removed})`);

  const assistant = turns.filter((t) => t.role === "assistant");
  const left: string[] = [];
  let open = false;
  for (const line of assistant.at(-1)?.text.split("\n") ?? []) {
    const item = BULLET.exec(line)?.[1];
    if (item) {
      if (open) left.push(item);
    } else if (line.trim()) {
      if (left.length) break; // prose after the list ends it
      open = LEFT.test(line);
    }
  }

  const decisions = new Set<string>();
  for (const t of assistant)
    for (const s of t.text.split(/(?<=[.!?])\s+|\n/))
      if (DECISION.test(s)) decisions.add(s.replace(BULLET, "$1").trim());

  return { done: [...done].slice(0, 8), left: left.slice(0, 8), decisions: [...decisions].slice(0, 5), ask: "" };
}
