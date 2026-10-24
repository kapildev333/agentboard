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

export const SettingsIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
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
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="m4.5 6 2 2-2 2M8.5 10.5h3" />
  </Icon>
);

export const NoteIcon = () => (
  <Icon>
    <path d="M3.5 2.5h9v7l-4 4h-5z" />
    <path d="M8.5 13.5v-4h4" />
  </Icon>
);

/** The AgentBoard mark: four squares, one of them the accent. */
export const Logo = () => (
  <svg className="logo" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <rect x="1" y="1" width="7" height="7" rx="1.5" fill="var(--color-accent)" />
    <rect x="10" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
    <rect x="1" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
    <rect x="10" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.55" />
  </svg>
);
