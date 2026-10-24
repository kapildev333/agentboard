import type { Handoff, Team } from "@agentboard/shared";

export const REVIEWER_ASK =
  "Review the diff for correctness and copy. Do not edit files; leave comments as a numbered list and say approve or changes requested on the last line.";
const DEFAULT_ASK = "Continue the work from this brief.";

const list = (items: string[]) => (items.length ? items : ["none"]).map((i) => `- ${i}`).join("\n");

/** The text the target receives, as the mockup's "What the reviewer will receive"; diffFiles counts the diff's files. */
export function renderPrompt(handoff: Handoff, team: Team | undefined, fromTitle: string, toRole: string | undefined, diffFiles = 0): string {
  const { brief, attachments: a } = handoff;
  const ask = brief.ask || (toRole === "reviewer" ? REVIEWER_ASK : DEFAULT_ASK);
  const attached = [
    a.diff && `diff (${diffFiles} files)`,
    a.teamBrief && team && "team brief",
    a.lastLines && "last lines",
    ...a.files,
  ].filter(Boolean);
  return [
    team && toRole ? `You are the ${toRole} on team "${team.name}". Brief from ${fromTitle} follows.` : `Brief from ${fromTitle} follows.`,
    `## What was done\n${list(brief.done)}`,
    `## What's left\n${list(brief.left)}`,
    brief.decisions.length && `## Decisions\n${list(brief.decisions)}`,
    `## Ask\n${ask}`,
    attached.length && `[attached: ${attached.join(", ")}]`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
