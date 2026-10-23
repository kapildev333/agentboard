import { Background, MiniMap, NodeResizer, ReactFlow, Controls, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { BoardNode } from "@agentboard/shared";
import { useBoard } from "./store";

// Exported so tests can assert on the props Board hands to ReactFlow.
export const flowProps = { minZoom: 0.25, maxZoom: 2 } as const;

type Data = { node: BoardNode };

/** Wraps every node view with the test id and a resizer that writes back through resizeNode. */
function withFrame(View: NodeTypes[string]) {
  return function Framed(props: NodeProps) {
    const resizeNode = useBoard((s) => s.resizeNode);
    return (
      <div data-testid={`node-${props.id}`} style={{ width: "100%", height: "100%" }}>
        <NodeResizer
          isVisible={props.selected}
          minWidth={120}
          minHeight={80}
          onResizeEnd={(_, p) => resizeNode(props.id, p.width, p.height)}
        />
        <View {...props} />
      </div>
    );
  };
}

export function Board({ nodeTypes }: { nodeTypes: NodeTypes }) {
  const ws = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId));
  const { moveNode, setViewport } = useBoard.getState();
  const types = useMemo(() => Object.fromEntries(Object.entries(nodeTypes).map(([k, v]) => [k, withFrame(v)])), [nodeTypes]);
  const nodes: Node<Data>[] = (ws?.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    width: n.w,
    height: n.h,
    data: { node: n },
  }));
  return (
    <ReactFlow
      key={ws?.id}
      {...flowProps}
      nodes={nodes}
      nodeTypes={types}
      defaultViewport={ws?.viewport}
      panOnDrag
      zoomOnPinch
      zoomActivationKeyCode={["Meta", "Control"]}
      zoomOnScroll={false}
      panOnScroll
      nodesDraggable
      onNodeDragStop={(_, n) => moveNode(n.id, n.position.x, n.position.y)}
      onMoveEnd={(_, v) => setViewport(v)}
    >
      <MiniMap pannable zoomable />
      <Controls showFitView />
      <Background />
    </ReactFlow>
  );
}
