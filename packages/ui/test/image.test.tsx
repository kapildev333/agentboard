import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { NodeProps } from "@xyflow/react";
import type { Board, ImageNode } from "@agentboard/shared";
import { useBoard } from "../src/board";
import { ImageView, useImages } from "../src/image";

const reply = (width: number, height: number) =>
  vi.fn(async () => new Response(JSON.stringify({ id: "a".repeat(64), width, height }), { status: 201 })) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
const setup = (fetch: typeof globalThis.fetch, zoom = 1) => {
  useBoard.getState().setBoard({
    version: 1,
    repoPath: "/r",
    activeWorkspaceId: "a",
    workspaces: [{ id: "a", name: "A", viewport: { x: 0, y: 0, zoom }, nodes: [] }],
  } as Board);
  const Pane = () => {
    const ref = useRef<HTMLDivElement>(null);
    const images = useImages(fetch, ref);
    return (
      <div ref={ref} data-testid="pane">
        {images.input}
        <button type="button" onClick={() => images.adds[0]!.create()}>{images.adds[0]!.label}</button>
      </div>
    );
  };
  return render(<Pane />);
};
const nodes = () => useBoard.getState().board.workspaces[0]!.nodes;
// jsdom has no DragEvent, so the coordinates are set on the event after it is made.
const drop = (clientX: number, clientY: number) => {
  const e = createEvent.drop(screen.getByTestId("pane"), { dataTransfer: { files: [png()], types: ["Files"] } });
  Object.assign(e, { clientX, clientY });
  fireEvent(screen.getByTestId("pane"), e);
};
const png = () => new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

afterEach(cleanup);

it("a dropped file posts to /api/assets and adds a node at the drop position", async () => {
  const fetch = reply(960, 480);
  setup(fetch);
  drop(120, 80);
  await waitFor(() => expect(nodes()).toHaveLength(1));
  const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/assets");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>)["content-type"]).toBe("image/png");
  // 960 by 480 scales to 480 wide.
  expect(nodes()[0]).toMatchObject({ type: "image", assetId: "a".repeat(64), width: 960, height: 480, x: 120, y: 80, w: 480, h: 240 });
});

it("the drop position follows the viewport zoom", async () => {
  setup(reply(100, 50), 2);
  drop(200, 100);
  await waitFor(() => expect(nodes()).toHaveLength(1));
  expect(nodes()[0]).toMatchObject({ x: 100, y: 50, w: 100, h: 50 });
});

it("a pasted image is added and a file that is not an image is ignored", async () => {
  const fetch = reply(40, 20);
  setup(fetch);
  fireEvent.paste(document.body, { clipboardData: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
  fireEvent.paste(document.body, { clipboardData: { files: [png()] } });
  await waitFor(() => expect(nodes()).toHaveLength(1));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("Image in the add list opens a file input whose pick is uploaded", async () => {
  const fetch = reply(10, 10);
  const { container } = setup(fetch);
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "Image" }));
  expect(click).toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [png()] } });
  await waitFor(() => expect(nodes()).toHaveLength(1));
});

it("ImageView renders the stored image at the node's size", () => {
  const node: ImageNode = { id: "i", type: "image", title: "Image", x: 0, y: 0, w: 300, h: 150, assetId: "b".repeat(64), width: 600, height: 300, alt: "shot" };
  render(<ImageView {...({ data: { node } } as unknown as NodeProps)} />);
  const img = screen.getByAltText("shot");
  expect(img.getAttribute("src")).toBe(`/api/assets/${"b".repeat(64)}`);
  expect(img.getAttribute("width")).toBe("300");
  expect(img.getAttribute("height")).toBe("150");
});
