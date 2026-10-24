import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface MenuProps {
  /** The popup's accessible name; also the trigger's when the trigger is an icon. */
  label: string;
  trigger: ReactNode;
  icon?: boolean;
  /** role="menu" with menuitem children; otherwise a plain group of buttons. */
  menu?: boolean;
  children: (close: () => void) => ReactNode;
}

/**
 * A footer button and the popup above it. Escape or a pick closes it and focus returns to the trigger; a press
 * outside closes it; the arrow keys, Home and End move between its buttons. nodrag, so a click never drags the node.
 */
export function Menu({ label, trigger, icon, menu, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const items = () => [...(root.current?.querySelectorAll<HTMLElement>(".console-menu button") ?? [])];
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (e: Event) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      return close();
    }
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined || !all.length) return;
    e.preventDefault();
    all[(next + all.length) % all.length]!.focus();
  };
  return (
    <div ref={root} className="console-menu-wrap nodrag" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={icon ? "btn-sm btn-quiet console-icon-btn" : "btn-sm btn-quiet"}
        aria-label={icon ? label : undefined}
        aria-haspopup={menu ? "menu" : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div className="console-menu" role={menu ? "menu" : "group"} aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
