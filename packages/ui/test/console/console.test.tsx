/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes for xterm and the socket */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConsoleNode } from "../../src/console";

const x = vi.hoisted(() => ({
  term: undefined as any,
  fit: undefined as any,
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
    options: any;
    constructor(opts: any) {
      this.options = { ...opts };
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
});

const mount = (extra: object = {}) =>
  render(
    <ReactFlowProvider>
      <ConsoleNode {...({ id: "n1", data: { node: { id: "c1", title: "Claude" } }, socketFactory: factory, ...extra } as any)} />
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
    const root = container.querySelector("div > div > div") as HTMLElement;
    expect(container.querySelector("header")!.className).not.toMatch(/nodrag/);
    expect(root.className).not.toMatch(/nodrag/);
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

  it("Cmd+C with a selection and Cmd+V are left to the browser, so paste happens once", () => {
    mount();
    const key = (k: string) => x.term.keyHandler({ type: "keydown", key: k, metaKey: true, ctrlKey: false } as KeyboardEvent);
    expect(key("v")).toBe(false);
    x.term.selection = "sel";
    expect(key("c")).toBe(false);
    x.term.selection = "";
    expect(key("c")).toBe(true);
    expect(x.term.pasted).toBe("");
  });

  it("changing fontSize keeps the same terminal and refits", () => {
    const { rerender } = mount({ fontSize: 13 });
    const term = x.term;
    x.fit.fit.mockClear();
    rerender(
      <ReactFlowProvider>
        <ConsoleNode {...({ id: "n1", data: { node: { id: "c1", title: "Claude" } }, socketFactory: factory, fontSize: 18 } as any)} />
      </ReactFlowProvider>,
    );
    expect(x.term).toBe(term);
    expect(term.options.fontSize).toBe(18);
    expect(x.fit.fit).toHaveBeenCalled();
  });

  it("reconnects once after a close, and attaches again", () => {
    mount();
    act(() => sockets[0]!.onclose!());
    expect(sockets).toHaveLength(2);
    act(() => sockets[1]!.open());
    expect(x.term.written).toEqual(["\x1bc"]);
    expect(sockets[1]!.sent[0]).toBe(JSON.stringify({ t: "attach", consoleId: "c1" }));
    act(() => sockets[1]!.onclose!());
    expect(sockets).toHaveLength(2);
  });
});
