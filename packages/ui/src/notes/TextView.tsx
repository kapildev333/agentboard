import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { TextNode } from "@agentboard/shared";
import { patchNode, useDraft } from "./edit";
import { renderMarkdown } from "./markdown";
import "./notes.css";

export function TextView(props: NodeProps) {
  const node = (props.data as { node: TextNode }).node;
  const [editing, setEditing] = useState(false);
  return (
    <div className="text-card">
      <div className="notes-head">
        <strong>{node.title || "Text"}</strong>
        <button type="button" className="btn-sm nodrag" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? <Editor node={node} /> : <div className="text-body nodrag nowheel" dangerouslySetInnerHTML={{ __html: renderMarkdown(node.markdown) }} />}
    </div>
  );
}

function Editor({ node }: { node: TextNode }) {
  const draft = useDraft(node.markdown, (markdown) => patchNode(node.id, (n) => ({ ...n, markdown }) as typeof n));
  return <textarea className="text-edit nodrag nowheel" aria-label="Markdown" {...draft} />;
}
