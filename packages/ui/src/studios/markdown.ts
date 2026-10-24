import { Marked } from "marked";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// marked passes entities in a target through, and the browser decodes them in the attribute, so decode until
// stable before judging; a target still changing after a few rounds is refused.
function decode(s: string): string | null {
  for (let i = 0; i < 5; i++) {
    const next = new DOMParser().parseFromString(s, "text/html").documentElement.textContent ?? "";
    if (next === s) return s;
    s = next;
  }
  return null;
}

/** http, https, mailto, or a scheme-less target (#, /, ., a plain relative path); anything else becomes "#". */
export function safeUrl(href: string): string {
  const url = decode(href)?.trim();
  if (url === undefined) return "#";
  // Browsers drop tabs, newlines and control characters inside a scheme, so judge without them.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec([...url].filter((c) => c > " " && c !== "\u007f").join(""))?.[1]?.toLowerCase();
  return scheme === undefined || ["http", "https", "mailto"].includes(scheme) ? url : "#";
}

// Agents write these files, so raw HTML shows as text and only the allowed link targets survive.
const md = new Marked({
  renderer: { html: ({ text }) => escape(text) },
  walkTokens: (t) => {
    if (t.type === "link" || t.type === "image") t.href = safeUrl(t.href);
  },
});

export function renderMarkdown(text: string): string {
  return md.parse(text, { async: false });
}

/** ATX headings with their 1-based line, skipping fenced code. */
export function headings(text: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let fence: string | null = null; // the opening marker, e.g. "```" or "~~~~"
  text.split("\n").forEach((l, i) => {
    const f = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (fence) {
      // Only the same character, at least as long, with nothing after it closes a fence.
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !f[2]!.trim()) fence = null;
      return;
    }
    if (f) return void (fence = f[1]!);
    const m = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(l);
    if (m) out.push({ level: m[1]!.length, text: m[2]!, line: i + 1 });
  });
  return out;
}
