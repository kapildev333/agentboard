/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes for xterm and the socket */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSOLE_DRAG_HANDLE, ConsoleNode } from "../../src/console";

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
let observed: unknown[] = [];

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      roCallback = cb;
    }
    observe(el: unknown) {
      observed.push(el);
    }
    unobserve() {}
    disconnect() {}
  } as never;
});
afterEach(() => {
  cleanup();
  sockets = [];
  observed = [];
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
    for (const raw of ["not json", '{"t":"nope","consoleId":"c1"}', '{"__proto__":{"t":"output"}}', '{"t":"output","consoleId":"c1"}'])
      expect(() => act(() => sockets[0]!.onmessage!({ data: raw }))).not.toThrow();
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
    act(() => sockets[0]!.receive({ t: "exit", consoleId: "other", code: 0 }));
    expect(queryByText(/exited/)).toBeNull();
    act(() => sockets[0]!.receive({ t: "exit", consoleId: "c1", code: 0 }));
    expect(getByText(/exited/)).toBeTruthy();
  });

  it("Cmd+C with a selection and Cmd+V are left to the browser, so paste happens once", () => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux)", configurable: true });
    mount();
    const key = (k: string, mods = { ctrlKey: true, metaKey: false }) =>
      x.term.keyHandler({ type: "keydown", key: k, ...mods } as KeyboardEvent);
    expect(key("v")).toBe(false);
    x.term.selection = "sel";
    expect(key("c")).toBe(false);
    x.term.selection = "";
    expect(key("c")).toBe(true);
    expect(x.term.pasted).toBe("");
  });

  it("on macOS only Cmd is the clipboard key, Ctrl goes to the PTY", () => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", configurable: true });
    mount();
    const key = (k: string, mods: object) => x.term.keyHandler({ type: "keydown", key: k, ctrlKey: false, metaKey: false, ...mods } as KeyboardEvent);
    x.term.selection = "sel";
    expect(key("v", { ctrlKey: true })).toBe(true);
    expect(key("c", { ctrlKey: true })).toBe(true);
    expect(key("v", { metaKey: true })).toBe(false);
    expect(key("c", { metaKey: true })).toBe(false);
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

  it("sends the fitted size only after attach, and does not reconnect after unmount", () => {
    const { unmount } = mount();
    act(() => x.term.handlers.resize({ cols: 100, rows: 30 }));
    expect(sockets[0]!.sent).toEqual([]);
    act(() => sockets[0]!.open());
    expect(sockets[0]!.sent).toEqual([
      JSON.stringify({ t: "attach", consoleId: "c1" }),
      JSON.stringify({ t: "resize", consoleId: "c1", cols: 100, rows: 30 }),
    ]);
    unmount();
    sockets[0]!.onclose!();
    expect(sockets).toHaveLength(1);
  });

  it("the header is the drag handle and holds the badge; the terminal element is observed", () => {
    const { container } = mount({ statusBadge: <span data-testid="badge">busy</span> });
    const header = container.querySelector(CONSOLE_DRAG_HANDLE)!;
    expect(header.tagName).toBe("HEADER");
    expect(header.querySelector("[data-testid=badge]")).not.toBeNull();
    expect(observed).toEqual([header.nextElementSibling]);
  });
});
