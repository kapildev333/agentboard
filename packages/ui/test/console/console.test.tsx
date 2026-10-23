import { act, cleanup, render } from "@testing-library/react";
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
});
