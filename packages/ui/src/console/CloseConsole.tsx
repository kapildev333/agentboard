import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GitStatusSchema, WorktreeRemoveRequestSchema, type ConsoleNode, type GitStatus, type Settings, type Worktree } from "@agentboard/shared";
import { useBoard } from "../board";
import { readJson } from "../git/http";
import { StatusBadge } from "../status";
import "../styles/close.css";

type Fetch = typeof globalThis.fetch;
type Choice = "keep" | "diff" | "remove";

// KILL_GRACE_MS in packages/daemon/src/pty/manager.ts.
const GRACE_SECONDS = 5;
// The primary button names the outcome.
const LABELS: Record<Choice, string> = { keep: "Close console, keep worktree", diff: "Show the diff", remove: "Close console, remove worktree" };
const plural =(n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Close button of a console. A console with a worktree asks what happens to it (F3.1), unless the worktree is
 * clean and pushed and the settings say not to ask; one without closes at once.
 */
export function CloseConsole({
  node,
  fetch,
  settings,
  onSettings,
  onShowDiff,
}: {
  node: ConsoleNode;
  fetch: Fetch;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onShowDiff: () => void;
}) {
  const opener = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState<{ status?: GitStatus; error?: string }>();

  // The board subscription ends the console; focus goes back to the board, on the next console if there is one.
  const leave = () => {
    const next = [...document.querySelectorAll<HTMLElement>(".react-flow__node")].find((n) => !n.contains(opener.current));
    next?.focus();
    useBoard.getState().removeNode(node.id);
  };
  // The console ends and leaves the daemon's board first, then the worktree goes; the page drops the node only once both did.
  const remove = async (wt: Worktree, force: boolean): Promise<string | undefined> => {
    await fetch(`/api/consoles/${encodeURIComponent(node.id)}`, { method: "DELETE" }).catch(() => null);
    const body = WorktreeRemoveRequestSchema.parse({ repo: useBoard.getState().board.repoPath, ...wt, deleteBranch: true, force });
    try {
      await readJson(await fetch("/api/git/worktree", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    } catch (e) {
      // The console is gone but its node stays, stopped, so the worktree is still in reach and Resume works.
      useBoard.setState(({ board }) => ({
        board: { ...board, workspaces: board.workspaces.map((w) => ({ ...w, nodes: w.nodes.map((n) => (n.id === node.id ? { ...n, status: "stopped" as const } : n)) })) },
      }));
      return (e as Error).message;
    }
    leave();
  };

  const close = async () => {
    const wt = node.worktree;
    if (!wt) return leave();
    const status = await fetch(`/api/git/status?path=${encodeURIComponent(wt.path)}`)
      .then(readJson)
      .then((b) => GitStatusSchema.parse(b))
      .catch(() => undefined);
    if (status && !status.dirty && !status.unpushed && settings.closeCleanWorktreesWithoutAsking) {
      const error = await remove(wt, false);
      if (error) setAsking({ status, error });
      return;
    }
    setAsking({ status });
  };

  return (
    <>
      <button ref={opener} type="button" className="btn-sm" aria-label={`Close ${node.title}`} onClick={() => void close()}>
        Close
      </button>
      {asking && node.worktree &&
        createPortal(
          <CloseDialog
            node={node}
            worktree={node.worktree}
            status={asking.status}
            initialError={asking.error}
            skipClean={settings.closeCleanWorktreesWithoutAsking ?? false}
            onSkipClean={(v) => onSettings({ ...settings, closeCleanWorktreesWithoutAsking: v })}
            onCancel={() => {
              setAsking(undefined);
              opener.current?.focus();
            }}
            onConfirm={async (choice) => {
              if (choice === "keep") return leave();
              if (choice === "diff") {
                setAsking(undefined);
                onShowDiff();
                return opener.current?.focus();
              }
              const s = asking.status;
              return remove(node.worktree!, !s || s.dirty > 0 || s.unpushed > 0);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function CloseDialog({
  node,
  worktree,
  status,
  initialError,
  skipClean,
  onSkipClean,
  onCancel,
  onConfirm,
}: {
  node: ConsoleNode;
  worktree: Worktree;
  status?: GitStatus;
  initialError?: string;
  skipClean: boolean;
  onSkipClean: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: (c: Choice) => Promise<string | void> | void;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<Choice>("keep");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const dirty = status?.dirty ?? 0, unpushed = status?.unpushed ?? 0;
  // Unknown status counts as unsaved work: force, and say so.
  const unsaved = !status || dirty > 0 || unpushed > 0;
  const repo = useBoard.getState().board.repoPath;
  const shown = worktree.path.startsWith(repo + "/") ? worktree.path.slice(repo.length + 1) : worktree.path;

  useEffect(() => ref.current?.querySelector<HTMLElement>("input:checked")?.focus(), []);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const e = await onConfirm(choice);
    setBusy(false);
    if (e) setError(e);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // Keys stay in the dialog: the board would move or delete a selected node, the terminal would type them.
    e.stopPropagation();
    if (e.key === "Escape") return onCancel();
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      return void confirm();
    }
    if (e.key === "Tab") {
      const all = [...ref.current!.querySelectorAll<HTMLElement>("input:checked, input[type=checkbox], button:not(:disabled)")];
      const wrap = e.shiftKey ? [all[0], all[all.length - 1]] : [all[all.length - 1], all[0]];
      if (document.activeElement === wrap[0]) {
        e.preventDefault();
        wrap[1]?.focus();
      }
    }
  };

  const option = (value: Choice, title: string, text: ReactNode, extra?: ReactNode) => (
    <label className={`close-opt${value === "remove" ? " danger" : ""}${choice === value ? " on" : ""}`}>
      <input type="radio" name={`${id}-wt`} value={value} checked={choice === value} onChange={() => setChoice(value)} />
      <span className="close-opt-text">
        <span className="close-opt-title">{title}</span>
        <span className="close-opt-desc">{text}</span>
      </span>
      {extra}
    </label>
  );

  return (
    <div className="close-layer" onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="backdrop" />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} className="close-dialog">
        <div className="close-head">
          <div className="close-title-row">
            <h2 id={`${id}-title`} className="close-title">Close “{node.title}”?</h2>
            <StatusBadge status={node.status} />
          </div>
          <p id={`${id}-desc`} className="close-desc">
            The console gets SIGHUP, then SIGKILL after {GRACE_SECONDS} seconds. If it is waiting on an approval prompt, whatever the agent proposed is
            not applied.
          </p>
          <div className={unsaved ? "close-warn" : "close-warn quiet"}>
            <span className="close-warn-title">{unsaved ? "This console owns a worktree with unsaved work" : "This console owns a worktree"}</span>
            <span className="close-warn-path">
              {shown} · <span className="close-warn-branch">{worktree.branch}</span>
            </span>
            <span className="close-chips">
              {dirty > 0 && <span className="chip warn">{plural(dirty, "uncommitted file", "uncommitted files")}</span>}
              {unpushed > 0 && <span className="chip warn">{plural(unpushed, "commit not pushed", "commits not pushed")}</span>}
              <span className="chip">base {worktree.base}</span>
            </span>
          </div>
        </div>
        <fieldset className="close-options">
          <legend className="close-legend">What happens to the worktree</legend>
          {option("keep", "Keep it", "The folder and branch stay. Spawn a console into it later from the worktrees list.", unsaved && <span className="chip">default when dirty</span>)}
          {option("diff", "Show me the diff first", "Opens the git card for this console so you can commit or stash before closing.")}
          {option(
            "remove",
            "Remove worktree and delete branch",
            <>
              Runs <code>git worktree remove{unsaved ? " --force" : ""}</code> and <code>git branch -D {worktree.branch}</code>.
              {unpushed > 0 && ` The unpushed ${unpushed === 1 ? "commit is" : "commits are"} lost.`}
              {dirty > 0 && " Uncommitted changes are lost."}
            </>,
          )}
        </fieldset>
        <label className="close-skip">
          <input type="checkbox" checked={skipClean} onChange={(e) => onSkipClean(e.target.checked)} />
          Don't ask again for clean worktrees (dirty or unpushed ones always ask)
        </label>
        {error && <p role="alert" className="close-error">{error}</p>}
        <div className="close-footer">
          <span className="close-keys">
            <kbd>Esc</kbd> cancels · <kbd>↵</kbd> confirms the selected option
          </span>
          <span className="close-spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void confirm()}>
            {LABELS[choice]}
          </button>
        </div>
      </div>
    </div>
  );
}
