const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const inline = (s: string) =>
  s
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2
        ? `<code>${part.slice(1, -1)}</code>`
        : part
            .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/\*([^*]+)\*/g, "<em>$1</em>"),
    )
    .join("");

/**
 * A small markdown subset to HTML: h1 to h3, paragraphs, bullet and numbered lists, bold, italic, inline and
 * fenced code, http(s) and mailto links. Everything is escaped first and the tags are added after, so raw
 * html never reaches the page. ponytail: no nesting, no tables, no images; a real parser if the subset grows.
 */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  const lines = esc(md).split("\n");
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | undefined;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join("")}</${list.tag}>`);
    para = [];
    list = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpMatchArray | null;
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i]!);
      out.push(`<pre><code>${code.join("\n")}</code></pre>`);
    } else if ((m = line.match(/^(#{1,3}) (.*)/))) {
      flush();
      out.push(`<h${m[1]!.length}>${inline(m[2]!)}</h${m[1]!.length}>`);
    } else if ((m = line.match(/^(?:([-*])|\d+\.) (.*)/))) {
      const tag = m[1] ? "ul" : "ol";
      if (list?.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(m[2]!);
    } else if (!line.trim()) flush();
    else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return out.join("");
}
