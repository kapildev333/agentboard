import type { ReactNode } from "react";

// Inline 14 px stroke icons, decorative (the control beside or around them carries the name).
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const FolderIcon = () => (
  <Icon>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </Icon>
);

/** Three sliders. The knobs are filled with the button's own background so the track stops at them. */
export const SettingsIcon = () => (
  <Icon>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    <circle cx="6" cy="4.5" r="1.4" fill="var(--color-surface-raised)" />
    <circle cx="10" cy="8" r="1.4" fill="var(--color-surface-raised)" />
    <circle cx="7.3" cy="11.5" r="1.4" fill="var(--color-surface-raised)" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </Icon>
);

export const TerminalIcon = () => (
  <Icon>
    <path d="m3.5 4.5 3.5 3.5-3.5 3.5M8.5 11.5h4.5" />
  </Icon>
);

export const NoteIcon = () => (
  <Icon>
    <path d="M3.5 2.5h7l2 2v9h-9zM10.5 2.5v2h2M5.5 8h5M5.5 10.5h3.5" />
  </Icon>
);

/** The AgentBoard mark: four squares on an accent tile, the last one dimmed. */
export const Logo = () => (
  <svg className="logo" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" rx="5" fill="var(--color-accent)" />
    <g fill="var(--color-on-accent)">
      <rect x="4" y="4" width="5" height="5" rx="1" />
      <rect x="11" y="4" width="5" height="5" rx="1" />
      <rect x="4" y="11" width="5" height="5" rx="1" />
      <rect x="11" y="11" width="5" height="5" rx="1" opacity="0.45" />
    </g>
  </svg>
);
