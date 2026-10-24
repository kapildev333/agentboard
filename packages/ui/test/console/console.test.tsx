/* eslint-disable @typescript-eslint/no-explicit-any -- loose fakes for xterm and the socket */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSOLE_DRAG_HANDLE, ConsoleNode } from "../../src/console";

const x = vi.hoisted(() => ({
  zoom: 1,
  term: undefined as any,
  fit: undefined as any,
}));
vi.mock("@xyflow/react", async (orig) => ({
  ...(await orig<typeof import("@xyflow/react")>()),
  useReactFlow: () => ({ getZoom: () => x.zoom }),
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
    mouse = { getCoords: vi.fn(), getMouseReportCoords: vi.fn() };
    scroll = vi.fn();
    _core = { _mouseService: { ...this.mouse }, _selectionService: { _screenElement: { getBoundingClientRect: () => ({ left: 10, top: 20 }) }, _getMouseEventScrollAmount: this.scroll } };
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
  x.zoom = 1;
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
      JSON.stringify({ t: "resize", consoleId: "c1", cols: 80, rows: 24 }),
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

  it("the header carries the agent's mark", () => {
    const { container } = mount({ data: { node: { id: "c1", title: "Claude", agent: "codex" } } });
    const mark = container.querySelector(".console-header .mark")!;
    expect(mark.className).toBe("mark mark-codex");
    expect(mark.textContent).toBe("X");
    expect(mark.getAttribute("aria-label")).toBe("codex");
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

  it("pointer coordinates are un-scaled by the current zoom for selection and mouse reports", () => {
    mount();
    const el = { getBoundingClientRect: () => ({ left: 10, top: 20 }) } as unknown as HTMLElement;
    const svc = x.term._core._mouseService;
    x.zoom = 2;
    svc.getCoords({ clientX: 110, clientY: 120 }, el, 80, 24);
    expect(x.term.mouse.getCoords).toHaveBeenCalledWith({ clientX: 60, clientY: 70 }, el, 80, 24);
    x.zoom = 0.5;
    svc.getMouseReportCoords({ clientX: 30, clientY: 30 }, el);
    expect(x.term.mouse.getMouseReportCoords).toHaveBeenCalledWith({ clientX: 50, clientY: 40 }, el);
    x.zoom = 2;
    x.term._core._selectionService._getMouseEventScrollAmount({ clientX: 110, clientY: 120 });
    expect(x.term.scroll).toHaveBeenCalledWith({ clientX: 60, clientY: 70 });
  });

  it("sends the first fitted size even when it equals xterm's default, and uses 10000 lines of scrollback", () => {
    mount();
    act(() => sockets[0]!.open());
    expect(sockets[0]!.sent).toContain(JSON.stringify({ t: "resize", consoleId: "c1", cols: 80, rows: 24 }));
    expect(x.term.options.scrollback).toBe(10000);
  });

  it("an inline factory does not reconnect on rerender", () => {
    const ui = (f: () => FakeSocket) => (
      <ReactFlowProvider>
        <ConsoleNode {...({ id: "n1", data: { node: { id: "c1", title: "Claude" } }, socketFactory: f } as any)} />
      </ReactFlowProvider>
    );
    const { rerender } = render(ui(() => factory()));
    rerender(ui(() => factory()));
    expect(sockets).toHaveLength(1);
  });
});

describe("console card", () => {
  it("the header shows the agent mark, branch chip and status pill", () => {
    const node = { id: "c1", title: "Claude: feature-a", agent: "claude", status: "working", lastActiveAt: new Date(Date.now() - 5 * 60_000).toISOString(), worktree: { path: "/r/.wt/a", branch: "feature-a", base: "main" } };
    const { container } = mount({ data: { node } });
    const header = container.querySelector("header")!;
    expect(header.querySelector(".mark")!.textContent).toBe("C");
    // The mark draws first but follows the title in the DOM: the e2e finds nodes by a header text starting with the title.
    expect(header.textContent).toMatch(/^Claude: feature-a/);
    expect(header.querySelector(".console-branch")!.textContent).toBe("feature-a");
    expect(header.querySelector(".console-elapsed")!.textContent).toBe("5m");
    const pill = header.querySelector("[data-status]")!;
    expect(pill.getAttribute("data-status")).toBe("working");
    expect(pill.textContent).toBe("Working");
  });
});
