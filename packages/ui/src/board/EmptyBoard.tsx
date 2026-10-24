import { useState } from "react";
import { addNoteAtCentre } from "./Board";
import { CopyIcon, NoteIcon, TerminalIcon } from "./icons";

const SPAWN = "agentboard spawn claude";
const HINTS = [
  ["⌘⇧N", "spawn a console"],
  ["N", "add a note"],
  ["⌘1–9", "switch workspace"],
  ["Esc", "close a dialog"],
] as const;

/** What an empty workspace shows instead of a bare canvas: the two ways to start, the CLI way, and the keys. */
export function EmptyBoard({ onSpawn }: { onSpawn: () => void }) {
  const [copied, setCopied] = useState("");
  return (
    <section className="card empty-board" aria-labelledby="empty-board-title">
      <h2 id="empty-board-title" className="section-heading">Nothing on this workspace yet</h2>
      <p className="muted">A workspace is a canvas of agent consoles and notes. Start a console here, or from a terminal you already have open.</p>
      <ul className="empty-actions">
        <li>
          <button type="button" className="empty-action" aria-labelledby="empty-spawn" aria-describedby="empty-spawn-desc" aria-keyshortcuts="Meta+Shift+N" onClick={onSpawn}>
            <TerminalIcon />
            <span className="empty-action-text">
              <strong id="empty-spawn">Spawn a console</strong>
              <span id="empty-spawn-desc" className="caption">
                Spawn a console or run <code>agentboard spawn</code> from any terminal
              </span>
            </span>
            <kbd className="kbd" aria-hidden="true">⌘⇧N</kbd>
          </button>
        </li>
        <li>
          <button type="button" className="empty-action" aria-labelledby="empty-note" aria-describedby="empty-note-desc" aria-keyshortcuts="N" onClick={addNoteAtCentre}>
            <NoteIcon />
            <span className="empty-action-text">
              <strong id="empty-note">Add a note</strong>
              <span id="empty-note-desc" className="caption">A sticky note in the middle of the view, for a plan or a brief</span>
            </span>
            <kbd className="kbd" aria-hidden="true">N</kbd>
          </button>
        </li>
      </ul>
      <div className="empty-cli">
        <span className="label">Or from a terminal already open</span>
        <code className="mono">{SPAWN}</code>
        <button
          type="button"
          className="btn-sm"
          aria-label={`Copy ${SPAWN}`}
          onClick={() => void navigator.clipboard?.writeText(SPAWN).then(() => setCopied("Copied"), () => setCopied("Could not copy"))}
        >
          <CopyIcon />
          Copy
        </button>
        <span role="status" className="caption">{copied}</span>
      </div>
      <ul className="empty-hints caption">
        {HINTS.map(([key, what]) => (
          <li key={key}>
            <kbd className="kbd">{key}</kbd> {what}
          </li>
        ))}
      </ul>
    </section>
  );
}
