import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";

const q = new URLSearchParams(location.search);
const wsPort = q.get("ws");
const zoom = Number(q.get("zoom") ?? 1);
const useWebgl = q.get("renderer") === "webgl";

window.__terms = [];
const fits = [];
const refit = () => fits.forEach((f) => f.fit());

function TermNode({ data }) {
  const el = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const term = new Terminal({ fontSize: 13, fontFamily: "Menlo, monospace" });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el.current);
    if (useWebgl) term.loadAddon(new WebglAddon());
    fit.fit();
    fits.push(fit);
    window.__terms[data.i] = term;
    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) => term.write(new Uint8Array(e.data));
    const sub = term.onData((d) => ws.readyState === 1 && ws.send(new TextEncoder().encode(d)));
    return () => (sub.dispose(), ws.close(), term.dispose());
  }, [data.i]);
  // React Flow ignores drag and wheel on elements carrying these classes. Only the terminal body
  // gets them, and only while focused; dragging is by the header (dragHandle), which never does.
  return (
    <div style={{ width: 480 }}>
      <div className="drag-handle" style={{ height: 20, background: "#444", cursor: "grab" }} />
      <div
        ref={el}
        className={focused ? "nodrag nowheel" : ""}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ width: 480, height: 300, background: "#000" }}
      />
    </div>
  );
}

const nodeTypes = { term: TermNode };
const nodes = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  type: "term",
  position: { x: (i % 3) * 520, y: Math.floor(i / 3) * 340 },
  dragHandle: ".drag-handle",
  data: { i },
}));

createRoot(document.getElementById("root")).render(
  <ReactFlowProvider>
    <ReactFlow
      defaultNodes={nodes}
      nodeTypes={nodeTypes}
      minZoom={0.25}
      maxZoom={2}
      defaultViewport={{ x: 40, y: 40, zoom }}
      onMoveEnd={refit}
    />
  </ReactFlowProvider>,
);
