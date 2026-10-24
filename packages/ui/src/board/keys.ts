/** True while keys go to a text field; a focused terminal is xterm's textarea, so it counts. */
export const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** ⌘ on a Mac, Ctrl elsewhere. */
export const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
