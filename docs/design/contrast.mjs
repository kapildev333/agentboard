// Prints the WCAG contrast ratio of every text and badge pair in tokens.css, dark and light, as README table rows.
// node docs/design/contrast.mjs
/* global URL, console, process */
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../packages/ui/src/styles/tokens.css", import.meta.url), "utf8");
const [dark, light] = css.split("@media (prefers-color-scheme: light)");
const vars = (s) => Object.fromEntries([...s.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const D = vars(dark);
const L = { ...D, ...vars(light) };
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pairs = [
  ["color-text", "color-bg"],
  ["color-text", "color-surface"],
  ["color-text", "color-surface-raised"],
  ["color-text", "color-surface-hover"],
  ["color-text-muted", "color-bg"],
  ["color-text-muted", "color-surface"],
  ["color-text-muted", "color-surface-raised"],
  ["color-on-accent", "color-accent"],
  ["color-on-accent", "color-accent-hover"],
  ["color-accent", "color-surface"],
  ["color-danger", "color-surface"],
  ["term-fg", "term-bg"],
  ["note-fg", "note-bg"],
  ["diff-added-fg", "diff-added-bg"],
  ["diff-removed-fg", "diff-removed-bg"],
  ...["starting", "working", "idle", "needs-you", "stopped", "exited"].map((s) => [`status-${s}-fg`, `status-${s}-bg`]),
  // ANSI black is left out: programs paint it as a background
  ...["red", "green", "yellow", "blue", "magenta", "cyan", "white"].flatMap((c) => [`term-ansi-${c}`, `term-ansi-bright-${c}`]).map((t) => [t, "term-bg"]),
  ["term-ansi-bright-black", "term-bg"],
  ...["claude", "codex", "gemini", "opencode", "custom"].map((a) => [`mark-${a}-fg`, `mark-${a}-bg`]),
];
// Non-text: control borders need 3:1 (WCAG 1.4.11).
const borders = [
  ["color-border-strong", "color-surface"],
  ["color-border-strong", "color-bg"],
];
let fail = false;
const row = (a, b, min) => {
  const [d, l] = [ratio(D[a], D[b]), ratio(L[a], L[b])];
  fail ||= Math.min(d, l) < min;
  console.log(`| \`--${a}\` on \`--${b}\` | ${d.toFixed(1)}:1 | ${l.toFixed(1)}:1 |`);
};
for (const [a, b] of pairs) row(a, b, 4.5);
for (const [a, b] of borders) row(a, b, 3);
if (fail) process.exitCode = 1;
