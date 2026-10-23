import type { Terminal } from "@xterm/xterm";

type Ev = { clientX: number; clientY: number };
type MouseService = {
  getCoords: (ev: Ev, el: HTMLElement, ...rest: unknown[]) => unknown;
  getMouseReportCoords: (ev: Ev, el: HTMLElement) => unknown;
};
type SelectionService = { _screenElement: HTMLElement; _getMouseEventScrollAmount: (ev: Ev) => number };

/**
 * xterm 6.0.0 divides the pointer offset, taken after React Flow's CSS scale, by the unscaled cell width,
 * so selection and mouse reports land on the wrong cells at any zoom but 1. Hand xterm the offset
 * as if unscaled. Uses the private `_core._mouseService` and `_core._selectionService._getMouseEventScrollAmount`; re-check on xterm upgrades.
 */
export function unscaleMouse(term: Terminal, getZoom: () => number) {
  const core = (term as unknown as { _core?: { _mouseService?: MouseService; _selectionService?: SelectionService } })._core;
  const ms = core?._mouseService;
  if (!ms) return;
  const at = (ev: Ev, el: HTMLElement): Ev => {
    const b = el.getBoundingClientRect();
    const z = getZoom();
    return { clientX: b.left + (ev.clientX - b.left) / z, clientY: b.top + (ev.clientY - b.top) / z };
  };
  const coords = ms.getCoords.bind(ms);
  const report = ms.getMouseReportCoords.bind(ms);
  ms.getCoords = (ev, el, ...rest) => coords(at(ev, el), el, ...rest);
  ms.getMouseReportCoords = (ev, el) => report(at(ev, el), el);
  // Drag-scroll during a selection compares the pointer offset with the unscaled canvas height.
  const sel = core?._selectionService;
  if (sel) {
    const scroll = sel._getMouseEventScrollAmount.bind(sel);
    sel._getMouseEventScrollAmount = (ev) => scroll(at(ev, sel._screenElement));
  }
}
