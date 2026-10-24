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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "@agentboard/shared";
import type { BoardNode } from "@agentboard/shared";
import { CONSOLE_DRAG_HANDLE } from "../console/dragHandle";
import { useBoard } from "./store";

type Data = { node: BoardNode };

// The mounted canvas (one at a time), for the chrome outside React Flow's tree: the zoom level and Add a note.
let flow: ReactFlowInstance<Node<Data>> | undefined;
const activeViewport = () => {
  const { board } = useBoard.getState();
  return board.workspaces.find((w) => w.id === board.activeWorkspaceId)?.viewport ?? { x: 0, y: 0, zoom: 1 };
};

/** The canvas zoom as a percentage; a click resets it to 100 %. */
export function ZoomLevel() {
  const zoom = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId)?.viewport.zoom ?? 1);
  const pct = `${Math.round(zoom * 100)}%`;
  return (
    <button
      type="button"
      className="btn-sm btn-quiet zoom-level mono"
      aria-label={`${pct}, reset zoom to 100%`}
      onClick={() => void flow?.zoomTo(1).then(() => flow && useBoard.getState().setViewport(flow.getViewport()))}
    >
      {pct}
    </button>
  );
}

const NOTE = { w: 240, h: 140 };

/** Adds a note at the middle of what the canvas shows. */
export function addNoteAtCentre() {
  const v = flow?.getViewport() ?? activeViewport();
  const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
  const x = ((pane?.width ?? 0) / 2 - v.x) / v.zoom - NOTE.w / 2;
  const y = ((pane?.height ?? 0) / 2 - v.y) / v.zoom - NOTE.h / 2;
  useBoard.getState().addNode({ id: crypto.randomUUID(), type: "note", title: "Note", x: Math.round(x), y: Math.round(y), ...NOTE, text: "New note" });
}

/** Wraps every node view with the test id and a resizer that writes back through resizeNode; app.css shows the resizer on hover. */
function withFrame(View: NodeTypes[string]) {
  return function Framed(props: NodeProps) {
    const { resizeNode, moveNode } = useBoard.getState();
    return (
      <div data-testid={`node-${props.id}`} className="node-frame">
        <NodeResizer
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
    dragHandle: n.type === "console" ? CONSOLE_DRAG_HANDLE : undefined,
    data: { node: n },
  }));

export function Board({ nodeTypes, onInit }: { nodeTypes: NodeTypes; onInit?: (rf: { fitView: () => unknown }) => void }) {
  const ws = useBoard((s) => s.board.workspaces.find((w) => w.id === s.board.activeWorkspaceId));
  const types = useMemo(() => Object.fromEntries(Object.entries(nodeTypes).map(([k, v]) => [k, withFrame(v)])), [nodeTypes]);
  // Keyed so a workspace switch remounts the canvas and its node state together.
  return ws && <Canvas key={ws.id} ws={ws} nodeTypes={types} onInit={onInit} />;
}

function Canvas({ ws, nodeTypes, onInit }: { ws: Workspace; nodeTypes: NodeTypes; onInit?: (rf: { fitView: () => unknown }) => void }) {
  const { moveNode, removeNode, setViewport } = useBoard.getState();
  // React Flow owns selection and in-flight drag state; the store is the source of truth at rest.
  const [nodes, setNodes] = useState(() => toFlow(ws.nodes, new Set()));
  useEffect(
    () => setNodes((prev) => toFlow(ws.nodes, new Set(prev.filter((n) => n.selected).map((n) => n.id)))),
    [ws.nodes],
  );
  useEffect(() => () => void (flow = undefined), []);
  return (
    <ReactFlow
      minZoom={0.25}
      maxZoom={2}
      nodes={nodes}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) => {
        setNodes((ns) => applyNodeChanges(changes, ns));
        // Every drag ends, and keyboard moves arrive, as a change with dragging: false; resizer ticks (absent) save on resize end.
        for (const c of changes) {
          if (c.type === "position" && c.position && c.dragging === false) moveNode(c.id, c.position.x, c.position.y);
          else if (c.type === "remove") removeNode(c.id);
        }
      }}
      defaultViewport={ws.viewport}
      panOnScroll
      onInit={(i) => {
        flow = i;
        onInit?.(i);
      }}
      onMoveEnd={(_, v) => setViewport(v)}
    >
      <MiniMap pannable zoomable position="bottom-right" />
      <Controls position="bottom-left" orientation="vertical" showInteractive={false} />
      <Background />
    </ReactFlow>
  );
}
