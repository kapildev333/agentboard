import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConsoleNode } from "../../src/console";

const x = vi.hoisted(() => ({
  term: undefined as any,
  fit: undefined as any,
  gl: undefined as any,
  webglFails: false,
}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    written: string[] = [];
    handlers: Record<string, (v: any) => void> = {};
    keyHandler?: (e: KeyboardEvent) => boolean;
    selection = "";
    pasted = "";
    constructor(public opts: any) {
      x.term = this;
    }
    loadAddon(a: any) {
      a.load?.(this);
    }
    open() {}
    onData(cb: (d: string) => void) {
      this.handlers.data = cb;
    }
    onResize(cb: (s: { cols: number; rows: number }) => void) {
      this.handlers.resize = cb;
    }
    attachCustomKeyEventHandler(cb: (e: KeyboardEvent) => boolean) {
      this.keyHandler = cb;
    }
    hasSelection = () => !!this.selection;
    getSelection = () => this.selection;
    paste(t: string) {
      this.pasted = t;
    }
    write(d: string) {
      this.written.push(d);
    }
    dispose() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
    constructor() {
      x.fit = this;
    }
  },
}));
vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    dispose = vi.fn();
    constructor() {
      if (x.webglFails) throw new Error("no webgl");
      x.gl = this;
    }
    onContextLoss() {}
  },
}));

class FakeSocket {
  sent: string[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  send(d: string) {
    this.sent.push(d);
  }
  close() {}
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

let sockets: FakeSocket[] = [];
const factory = () => {
  const s = new FakeSocket();
  sockets.push(s);
  return s;
};
let roCallback: () => void;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      roCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});
afterEach(() => {
  cleanup();
  sockets = [];
  x.webglFails = false;
});

const mount = (extra: object = {}) =>
  render(
    <ReactFlowProvider>
      <ConsoleNode {...({ id: "n1", data: { consoleId: "c1", title: "Claude" }, socketFactory: factory, ...extra } as any)} />
    </ReactFlowProvider>,
  );

describe("ConsoleNode", () => {
  it("a keypress sends an input message", () => {
    mount();
    act(() => sockets[0]!.open());
    act(() => x.term.handlers.data("x"));
    expect(sockets[0]!.sent).toEqual([
      JSON.stringify({ t: "attach", consoleId: "c1" }),
      JSON.stringify({ t: "input", consoleId: "c1", data: "x" }),
    ]);
  });

  it("a resize sends cols and rows", () => {
    mount();
    act(() => sockets[0]!.open());
    x.fit.fit.mockClear();
    act(() => roCallback());
    expect(x.fit.fit).toHaveBeenCalled();
    act(() => x.term.handlers.resize({ cols: 100, rows: 30 }));
    expect(sockets[0]!.sent.at(-1)).toBe(JSON.stringify({ t: "resize", consoleId: "c1", cols: 100, rows: 30 }));
  });

  it("output messages are written to the terminal", () => {
    mount();
    act(() => sockets[0]!.open());
    act(() => sockets[0]!.receive({ t: "output", consoleId: "c1", data: "hello" }));
    act(() => sockets[0]!.receive({ t: "output", consoleId: "other", data: "nope" }));
    expect(x.term.written).toEqual(["hello"]);
  });

  it("the focused node carries nodrag and nowheel", () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/nodrag/);
    act(() => root.querySelector("div")!.focus());
    fireEvent.focusIn(root);
    expect(root.className).toMatch(/nodrag/);
    expect(root.className).toMatch(/nowheel/);
    fireEvent.focusOut(root);
    expect(root.className).not.toMatch(/nowheel/);
  });

  it("exit shows the marker", () => {
    const { getByText, queryByText } = mount();
    act(() => sockets[0]!.open());
    expect(queryByText(/exited/)).toBeNull();
    act(() => sockets[0]!.receive({ t: "exit", consoleId: "c1", code: 0 }));
    expect(getByText(/exited/)).toBeTruthy();
  });

  it("copies the selection and pastes on Cmd or Ctrl V", async () => {
    const clip = { writeText: vi.fn(), readText: vi.fn().mockResolvedValue("pasted") };
    Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
    mount();
    const key = (k: string) => x.term.keyHandler({ type: "keydown", key: k, metaKey: true, ctrlKey: false } as KeyboardEvent);
    x.term.selection = "sel";
    expect(key("c")).toBe(false);
    expect(clip.writeText).toHaveBeenCalledWith("sel");
    expect(key("v")).toBe(false);
    await vi.waitFor(() => expect(x.term.pasted).toBe("pasted"));
  });

  it("reconnects once after a close, and attaches again", () => {
    mount();
    act(() => sockets[0]!.onclose!());
    expect(sockets).toHaveLength(2);
    act(() => sockets[1]!.open());
    expect(sockets[1]!.sent[0]).toBe(JSON.stringify({ t: "attach", consoleId: "c1" }));
    act(() => sockets[1]!.onclose!());
    expect(sockets).toHaveLength(2);
  });

  it("falls back to the DOM renderer when WebGL fails", () => {
    x.webglFails = true;
    mount();
    expect(x.term).toBeDefined();
  });
});
