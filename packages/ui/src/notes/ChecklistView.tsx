import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { ChecklistNode } from "@agentboard/shared";
import { patchNode } from "./edit";
import "./notes.css";

type Items = ChecklistNode["items"];

export function ChecklistView(props: NodeProps) {
  const node = (props.data as { node: ChecklistNode }).node;
  const [text, setText] = useState("");
  const set = (f: (items: Items) => Items) => patchNode(node.id, (n) => (n.type === "checklist" ? { ...n, items: f(n.items) } : n));
  const done = node.items.filter((i) => i.done).length;
  const add = () => {
    const t = text.trim();
    if (!t) return;
    set((items) => [...items, { text: t, done: false }]);
    setText("");
  };
  return (
    <div className="checklist">
      <div className="notes-head">
        <strong>{node.title || "Checklist"}</strong>
        <span className="notes-count">{`${done}/${node.items.length}`}</span>
      </div>
      <ul className="checklist-items nodrag nowheel">
        {node.items.map((item, i) => (
          <li key={i} className={item.done ? "done" : undefined}>
            <input id={`${node.id}-${i}`} type="checkbox" checked={item.done} onChange={() => set((items) => items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
            <label htmlFor={`${node.id}-${i}`}>{item.text}</label>
            <button type="button" className="btn-sm" aria-label={`Remove ${item.text}`} onClick={() => set((items) => items.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        className="checklist-add nodrag"
        placeholder="Add item"
        aria-label="Add item"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
    </div>
  );
}
