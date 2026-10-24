import type { NodeProps } from "@xyflow/react";
import type { NoteNode } from "@agentboard/shared";
import { patchNode, useDraft } from "./edit";
import "./notes.css";

export function NoteView(props: NodeProps) {
  const node = (props.data as { node: NoteNode }).node;
  const draft = useDraft(node.text, (text) => patchNode(node.id, (n) => ({ ...n, text })));
  return <textarea className="note nodrag nowheel" aria-label="Note" placeholder="Write a note…" {...draft} />;
}
