import { Marked } from "marked";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Agents write these files, so raw HTML shows as text and script-capable link schemes go nowhere.
const md = new Marked({
  renderer: { html: ({ text }) => escape(text) },
  walkTokens: (t) => {
    if ((t.type === "link" || t.type === "image") && /^\s*(javascript|vbscript|data):/i.test(t.href)) t.href = "#";
  },
});

export function renderMarkdown(text: string): string {
  return md.parse(text, { async: false });
}

/** ATX headings with their 1-based line, skipping fenced code. */
export function headings(text: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let fence = false;
  text.split("\n").forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (m) out.push({ level: m[1]!.length, text: m[2]!, line: i + 1 });
  });
  return out;
}
