import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AssetUploadResponseSchema, type ImageNode } from "@agentboard/shared";
import { useBoard } from "../board";

type Fetch = typeof globalThis.fetch;
type At = "centre" | { x: number; y: number };
const MAX_WIDTH = 480;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const imagesIn = (files: ArrayLike<File> | null | undefined) => Array.from(files ?? []).filter((f) => TYPES.includes(f.type));
// A paste into a text field (a note, a terminal's input) belongs to that field.
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName));

/**
 * Drop on `pane`, paste anywhere on the page, or the Image add entry: each image is POSTed to /api/assets and
 * lands as an image node, scaled to at most 480 px wide, at the drop point (paste and picker: the pane's centre).
 */
export function useImages(fetch: Fetch, pane: RefObject<HTMLElement | null>): {
  adds: { label: string; create: () => void }[];
  input: ReactNode;
} {
  const picker = useRef<HTMLInputElement>(null);
  // Reassigned every render, so the listeners below register once and still see the latest fetch.
  const add = useRef<(file: File, at: At) => Promise<void>>(undefined);
  add.current = async (file, at) => {
    const res = await fetch("/api/assets", { method: "POST", headers: { "content-type": file.type }, body: file }).catch(() => null);
    if (!res?.ok) return console.warn(`agentboard: could not upload ${file.name} (${res?.status ?? "no answer"})`);
    const { id, width, height } = AssetUploadResponseSchema.parse(await res.json());
    const { board, addNode } = useBoard.getState();
    const { x: vx, y: vy, zoom } = board.workspaces.find((w) => w.id === board.activeWorkspaceId)?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const rect = pane.current?.getBoundingClientRect();
    const w = Math.min(width, MAX_WIDTH);
    const h = Math.max(1, Math.round((height * w) / width));
    const client = at === "centre" ? { x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 } : at;
    // Flow coordinates: undo the pane offset, the pan and the zoom. The centre is where the image's middle sits.
    const fx = (client.x - (rect?.left ?? 0) - vx) / zoom, fy = (client.y - (rect?.top ?? 0) - vy) / zoom;
    const node: ImageNode = {
      id: crypto.randomUUID(),
      type: "image",
      title: file.name || "Image",
      x: at === "centre" ? fx - w / 2 : fx,
      y: at === "centre" ? fy - h / 2 : fy,
      w,
      h,
      assetId: id,
      width,
      height,
      alt: file.name,
    };
    addNode(node);
  };

  useEffect(() => {
    // On the document, filtered to the pane, so the pane may mount after this effect runs.
    const inPane = (e: Event) => e.target instanceof Node && !!pane.current?.contains(e.target);
    const over = (e: DragEvent) => inPane(e) && e.dataTransfer?.types.includes("Files") && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!inPane(e)) return;
      const files = imagesIn(e.dataTransfer?.files);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f, i) => void add.current!(f, { x: e.clientX + i * 24, y: e.clientY + i * 24 }));
    };
    const paste = (e: ClipboardEvent) => {
      if (editable(e.target)) return;
      const files = imagesIn(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => void add.current!(f, "centre"));
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, [pane]);

  return {
    adds: [{ label: "Image", create: () => picker.current?.click() }],
    input: (
      <input
        ref={picker}
        type="file"
        accept={TYPES.join(",")}
        multiple
        hidden
        aria-label="Choose images"
        onChange={(e) => {
          imagesIn(e.target.files).forEach((f) => void add.current!(f, "centre"));
          e.target.value = "";
        }}
      />
    ),
  };
}
