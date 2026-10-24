import type { BoardNode } from "@agentboard/shared";
import type { AddItem } from "./AddMenu";

// The menu hands over the viewport centre; each node centres itself on it.
const at = (p: { x: number; y: number }, w: number, h: number) => ({ id: crypto.randomUUID(), title: "", x: p.x - w / 2, y: p.y - h / 2, w, h });

export const noteAdds: AddItem[] = [
  { label: "Note", create: (p): BoardNode => ({ ...at(p, 240, 160), type: "note", text: "" }) },
  { label: "Text", create: (p): BoardNode => ({ ...at(p, 360, 240), type: "text", markdown: "# Title" }) },
  { label: "Checklist", create: (p): BoardNode => ({ ...at(p, 280, 200), type: "checklist", items: [] }) },
];
