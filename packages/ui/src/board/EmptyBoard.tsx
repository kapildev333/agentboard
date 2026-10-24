import { useState } from "react";
import { addNoteAtCentre } from "./Board";
import { NoteIcon, TerminalIcon } from "./icons";

const SPAWN = "agentboard spawn claude --worktree feat-x";

/** What an empty workspace shows instead of a bare canvas (the Board-Empty artboard): two ways to start, the CLI way, and the keys. */
export function EmptyBoard({ onSpawn }: { onSpawn: () => void }) {
  const [copied, setCopied] = useState("");
  return (
    <section className="card empty-board" aria-labelledby="empty-board-title">
      <div className="empty-head">
        <h2 id="empty-board-title" className="title">Nothing on this workspace yet</h2>
        <p className="muted">A console is a real terminal running one of your agent CLIs under your own login. Put as many as you like on the board.</p>
      </div>
      <div className="empty-actions">
        <button type="button" className="empty-action empty-action-primary" aria-labelledby="empty-spawn" aria-describedby="empty-spawn-desc" aria-keyshortcuts="Meta+Shift+N" onClick={onSpawn}>
          <span className="empty-tile">
            <TerminalIcon />
          </span>
          <span className="empty-action-text">
            <strong id="empty-spawn">Spawn a console</strong>
            <span id="empty-spawn-desc" className="caption">
              Spawn a console or run <code>agentboard spawn</code> from any terminal
            </span>
          </span>
          <kbd className="kbd" aria-hidden="true">⌘⇧N</kbd>
        </button>
        <button type="button" className="empty-action" aria-labelledby="empty-note" aria-describedby="empty-note-desc" aria-keyshortcuts="N" onClick={addNoteAtCentre}>
          <span className="empty-tile">
            <NoteIcon />
          </span>
          <span className="empty-action-text">
            <strong id="empty-note">Add a note</strong>
            <span id="empty-note-desc" className="caption">A sticky note next to the work</span>
          </span>
          <kbd className="kbd" aria-hidden="true">N</kbd>
        </button>
        <div className="empty-action empty-cli">
          <span className="empty-tile">
            <TerminalIcon />
          </span>
          <span className="empty-action-text">
            <strong>Or from a terminal already open</strong>
            <code className="mono">
              <span className="prompt" aria-hidden="true">$ </span>
              {SPAWN}
            </code>
            <span role="status" className="caption">{copied}</span>
          </span>
          <button
            type="button"
            className="btn-sm btn-quiet"
            aria-label={`Copy ${SPAWN}`}
            onClick={() => void navigator.clipboard?.writeText(SPAWN).then(() => setCopied("Copied"), () => setCopied("Could not copy"))}
          >
            Copy
          </button>
        </div>
      </div>
      <ul className="empty-hints caption">
        <li>
          <kbd className="kbd">Space</kbd> + drag pans
        </li>
        <li>
          <kbd className="kbd">⌘</kbd> + scroll zooms
        </li>
        <li>
          <kbd className="kbd">⌘1</kbd>–<kbd className="kbd">9</kbd> switch workspaces
        </li>
        <li>
          <kbd className="kbd">Esc</kbd> closes a dialog
        </li>
      </ul>
    </section>
  );
}
