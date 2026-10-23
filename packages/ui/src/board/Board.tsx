import {
  Background,
  Controls,
  MiniMap,
  NodeResizer,
  ReactFlow,
  applyNodeChanges,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "@agentboard/shared";
import type { BoardNode } from "@agentboard/shared";
import { useBoard } from "./store";

type Data = { node: BoardNode };

/** Wraps every node view with the test id and a resizer that writes back through resizeNode. */
function withFrame(View: NodeTypes[string]) {
  return function Framed(props: NodeProps) {
    const { resizeNode, moveNode } = useBoard.getState();
    return (
      <div data-testid={`node-${props.id}`} style={{ width: "100%", height: "100%" }}>
        <NodeResizer
          isVisible={props.selected}
          minWidth={120}
          minHeight={80}
          onResizeEnd={(_, p) => {
            // A top or left handle also moves the origin.
            moveNode(props.id, p.x, p.y);
            resizeNode(props.id, p.width, p.height);
          }}
        />
        <View {...props} />
      </div>
    );
  };
}

const toFlow = (nodes: BoardNode[], selected: Set<string>): Node<Data>[] =>
  nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    width: n.w,
    height: n.h,
    selected: selected.has(n.id),
    data: { node: n },
  }));

export function Board({ nodeTypes }: { nodeTypes: NodeTypes }) {
  const ws = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId));
  const types = useMemo(() => Object.fromEntries(Object.entries(nodeTypes).map(([k, v]) => [k, withFrame(v)])), [nodeTypes]);
  // Keyed so a workspace switch remounts the canvas and its node state together.
  return ws && <Canvas key={ws.id} ws={ws} nodeTypes={types} />;
}

function Canvas({ ws, nodeTypes }: { ws: Workspace; nodeTypes: NodeTypes }) {
  const { moveNode, removeNode, setViewport } = useBoard.getState();
  // React Flow owns selection and in-flight drag state; the store is the source of truth at rest.
  const [nodes, setNodes] = useState(() => toFlow(ws.nodes, new Set()));
  useEffect(
    () => setNodes((prev) => toFlow(ws.nodes, new Set(prev.filter((n) => n.selected).map((n) => n.id)))),
    [ws.nodes],
  );
  return (
    <ReactFlow
      minZoom={0.25}
      maxZoom={2}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) => {
        setNodes((ns) => applyNodeChanges(changes, ns));
        // Keyboard moves and deletes never pass through drag stop; in-flight drags are saved there.
        for (const c of changes) {
          if (c.type === "position" && c.position && !c.dragging) moveNode(c.id, c.position.x, c.position.y);
          else if (c.type === "remove") removeNode(c.id);
        }
      }}
      defaultViewport={ws.viewport}
      zoomActivationKeyCode={["Meta", "Control"]}
      zoomOnScroll={false}
      panOnScroll
      onNodeDragStop={(_, __, dragged) => dragged.forEach((n) => moveNode(n.id, n.position.x, n.position.y))}
      onMoveEnd={(_, v) => setViewport(v)}
    >
      <MiniMap pannable zoomable />
      <Controls />
      <Background />
    </ReactFlow>
  );
}
