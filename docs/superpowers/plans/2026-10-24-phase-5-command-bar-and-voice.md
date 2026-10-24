# Phase 5 Plan: Command Bar and Voice

> **For agentic workers:** the same rules as the MVP plan (`2026-10-23-multi-agent-build-plan.md`): one lane per worktree, failing test first, `scripts/gate.sh` before the PR, no merge by a worker, decisions recorded on issue #27.

**Goal:** a natural-language command bar (⌘K) that moves the board, then push-to-talk on top of it with on-device transcription and a spoken reply. Gate: a spoken command moves the board hands-free (spec, "Phase 5").

**Design reference:** the "05 · Command bar and voice" row of the AgentBoard Screens canvas (artboards "Command bar (⌘K)" and "Voice · push-to-talk"). The tokens are the ones already in `packages/ui/src/styles/tokens.css`.

**What exists under it:** phases 0 to 2 only. Phases 3 and 4 (board extras, orchestration) are not built, so the command vocabulary covers what the daemon can do today: spawn a console (optionally in a worktree, with a first prompt, placed beside another console), close consoles, resume a stopped console, focus a console, fit the board, add a note, type a prompt into a console. Handoffs, loops and teams wait for phase 4 (D49).

## Rulings that shape this phase (issue #27)

- D45 Planner: a deterministic rule-based parser is the default and the only planner in tests. An optional local-model planner (an Ollama-compatible `/api/chat` at a loopback URL from settings) may propose the plan; the daemon validates its JSON against `PlanSchema`, regenerates every step id and recomputes `asks` from the step kind, and falls back to the rules on any failure. The planner receives the board snapshot (titles, agents, statuses, branches, workspaces, available agents), never terminal text. Non-loopback planner URLs are refused at settings time and at call time.
- D46 Transcription runs on this machine through a user-configured command that takes the audio file path as its last argument and prints the transcript on stdout (whisper.cpp's `whisper-cli -nt -f <file>` is the documented example). No browser cloud speech API. Tests and the e2e use `packages/e2e/fake-transcriber/index.mjs`, which prints a fixed sentence; no worker installs or runs whisper (D31 extends to it).
- D47 Spoken replies use the browser's `speechSynthesis`; no TTS service, no network.
- D48 Steps that close consoles or type into a running console always ask. `POST /api/command/run` executes steps in order; an asking step runs only when its id is in `confirmed`, is skipped when in `skipped`, and the whole request is refused with 409 when an asking step is in neither.
- D50 Audio is captured with `MediaRecorder` while the hold key (Alt+Space, shown as ⌥Space) is down and posted to the daemon as one request; the daemon writes it to a temp file under `AGENTBOARD_HOME`, runs the transcriber, and deletes the file whatever the outcome.
- D51 This plan lands through a governor chore PR; the lane issues are created with `gh` directly since `scripts/board-init.py` only knows phases 0 to 2.

## The contract (L50 writes it verbatim; every other lane imports it)

In `packages/shared/src/schemas.ts`:

```ts
export const SnapshotConsoleSchema = z.object({
  id: z.string(), title: z.string(), agent: AgentIdSchema, customId: z.string().optional(),
  status: ConsoleStatusSchema, branch: z.string().optional(), cwd: z.string(),
  workspaceId: z.string(), idleSeconds: z.number().int().nonnegative(),
});
export const BoardSnapshotSchema = z.object({
  repoPath: z.string(), activeWorkspaceId: z.string(),
  workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
  consoles: z.array(SnapshotConsoleSchema),
  agents: z.array(AgentInfoSchema),
});
const step = { id: z.string(), summary: z.string(), detail: z.string().optional(), asks: z.boolean() };
export const PlanStepSchema = z.discriminatedUnion("kind", [
  z.object({ ...step, kind: z.literal("spawn"), agent: AgentIdSchema, customId: z.string().optional(), worktree: z.string().optional(), prompt: z.string().optional(), near: z.string().optional() }),
  z.object({ ...step, kind: z.literal("close"), consoleIds: z.array(z.string()).min(1) }),
  z.object({ ...step, kind: z.literal("resume"), consoleId: z.string() }),
  z.object({ ...step, kind: z.literal("focus"), consoleId: z.string() }),
  z.object({ ...step, kind: z.literal("fit") }),
  z.object({ ...step, kind: z.literal("note"), text: z.string() }),
  z.object({ ...step, kind: z.literal("input"), consoleId: z.string(), text: z.string() }),
]);
export const PlannedBySchema = z.union([z.literal("rules"), z.object({ model: z.string(), url: z.string() })]);
export const PlanSchema = z.object({
  id: z.string(), text: z.string(), steps: z.array(PlanStepSchema),
  plannedBy: PlannedBySchema, ms: z.number().nonnegative(),
  /** One or two spoken sentences: what will happen and what needs an OK. */
  reply: z.string(),
  /** Set when nothing could be planned; steps is then empty. */
  unknown: z.string().optional(),
});
export const PlanRequestSchema = z.object({ text: z.string().min(1), repo: z.string() });
export const RunRequestSchema = z.object({ plan: PlanSchema, confirmed: z.array(z.string()), skipped: z.array(z.string()) });
export const StepResultSchema = z.object({ stepId: z.string(), status: z.enum(["done", "skipped", "failed"]), error: z.string().optional(), consoleId: z.string().optional() });
/** focus and fit are the page's to perform; the daemon only reports them. */
export const RunResponseSchema = z.object({ results: z.array(StepResultSchema), focus: z.string().optional(), fit: z.boolean().optional() });
export const TranscribeResponseSchema = z.object({ text: z.string(), ms: z.number().nonnegative(), engine: z.string() });
export const PlannerSettingsSchema = z.object({ url: z.string().url(), model: z.string() });
export const VoiceSettingsSchema = z.object({ transcribeCommand: z.string(), holdKey: z.literal("alt+space") });
export const SettingsSchema = z.object({ fontSize: z.number(), customAgents: z.array(CustomAgentSchema), planner: PlannerSettingsSchema.optional(), voice: VoiceSettingsSchema.optional() });
```

Routes added to `packages/shared/src/routes.ts` (and `fixtures/routes.json`):

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | /api/command/plan | PlanRequestSchema | PlanSchema |
| POST | /api/command/run | RunRequestSchema | RunResponseSchema |
| POST | /api/voice/transcribe | raw audio body (`audio/webm`, `audio/wav`, `audio/ogg`), `request: null` | TranscribeResponseSchema |

Which kinds ask (D48): `close` and `input`. Everything else is safe. A helper `stepAsks(kind)` in `packages/shared/src/command.ts` is the one place that says so.

## Lanes

| Lane | Title | Owns (paths) | Starts after | Model |
| --- | --- | --- | --- | --- |
| L50 | Contracts: snapshot, plan, run, transcribe, settings | packages/shared | nothing | Sonnet |
| L51 | Planner: rule parser and optional local-model planner | packages/daemon/src/command/plan.ts, packages/daemon/src/command/rules.ts, packages/daemon/src/command/model.ts, packages/daemon/test/command | L50 | Opus |
| L52 | Snapshot, executor and the command routes | packages/daemon/src/command/snapshot.ts, packages/daemon/src/command/run.ts, packages/daemon/src/app.ts, packages/daemon/test/app.test.ts, packages/daemon/test/command/run.test.ts | L50, L51 | Sonnet |
| L53 | Command bar UI (⌘K) | packages/ui/src/command, packages/ui/src/app.tsx, packages/ui/test/command, packages/ui/src/styles/app.css | L50 | Sonnet |
| L54 | Voice transcription in the daemon | packages/daemon/src/voice, packages/daemon/test/voice, packages/e2e/fake-transcriber, packages/daemon/src/app.ts (the one route) | L50 | Sonnet |
| L55 | Voice UI: push-to-talk, listening chip, voice dialog, spoken reply, settings fields | packages/ui/src/voice, packages/ui/src/shell/SettingsPanel.tsx, packages/ui/src/app.tsx, packages/ui/test/voice, packages/ui/src/styles/app.css | L53, L54 | Sonnet |
| L56 | Phase 5 e2e: typed command, confirmed close, spoken command | packages/e2e | L52, L55 | Opus |

Dispatch follows the graph: L50 first; L51, L53 and L54 stacked on L50's branch as soon as its schemas are committed; L52 stacked on L51; L55 after L53 and L54 merge; L56 last. L52 and L54 both touch `packages/daemon/src/app.ts` in different handlers; the second to merge rebases. L53 and L55 both touch `packages/ui/src/app.tsx`; L55 starts after L53 merged.

## Task cards

| Lane | Produces | First failing test | Done when |
| --- | --- | --- | --- |
| L50 | The schemas, types and routes above, verbatim; `command.ts` with `stepAsks(kind)` and `summarise(step, snapshot)` returning the one-line summary the UI shows ("Close CI cleanup and Lint sweep", "Spawn codex in worktree fix/flaky-cart-test"); fixtures `fixtures/snapshot.json` and `fixtures/plan.json`; types exported from `types.ts` and `index.ts` | packages/shared/test/command.test.ts: `PlanSchema` parses fixtures/plan.json; `stepAsks("close")` is true and `stepAsks("fit")` false; a run request whose plan has an unknown kind is rejected | Every new route has a schema and a fixture; old settings files without `planner` and `voice` still parse |
| L51 | `planCommand(text, snapshot, settings): Promise<Plan>`; `rules.ts`: a table of intent patterns over normalised text that resolves console references by title (case-insensitive, prefix and word match), by status ("the idle ones", "the one that needs me", "the stopped console"), by agent ("the codex console") and by count ("the two idle consoles"); agent names, "in a worktree [from <base>]", branch names from "fix the flaky cart test" (kebab-case, `fix/` when the text says fix), a quoted or trailing "to <prompt>" clause, "next to <title>", "fit", "focus", "resume", "note <text>", "tell <title> to <text>"; `model.ts`: a planner over `fetch` to `<url>/api/chat` with `format: "json"`, a system prompt that carries the schema and the snapshot, a 8 s timeout, loopback-only URL check, and D45's validation and fallback; `reply` text for voice; unknown text gives `unknown` with a hint | packages/daemon/test/command/rules.test.ts: "close the two idle consoles and resume the docs pass" over fixtures/snapshot.json yields a close step with both idle ids (asks) and a resume step (safe) | A table-driven test covers at least 25 utterances including the two on the canvas; the model planner is tested with a fake fetch, including a bad JSON answer that falls back to the rules |
| L52 | `snapshot(board, agents, now)` building a `BoardSnapshot`; `runPlan(plan, confirmed, skipped, deps)` executing spawn (through the existing spawn path, placed beside `near` when given), close, resume, note, input (writes to the PTY) and reporting focus and fit; `POST /api/command/plan` calling L51 and `POST /api/command/run`; settings `PUT` refusing a non-loopback planner URL | packages/daemon/test/command/run.test.ts: a plan with a close step runs only when confirmed and is refused with 409 when neither confirmed nor skipped | app.test.ts covers both routes against a real daemon with the fake agent; a spawn step with `near` lands in the next free slot right of that console |
| L53 | `CommandBar` opened with ⌘K or Ctrl+K and a top-bar button, closed with Esc; an input that plans on Enter (debounced 300 ms while typing, cancelled on change); the plan list with step numbers, summaries, detail lines, "safe" and "asks" chips and a lock line; "Or jump to" suggestions computed on the page (focus the console that needs me, fit all, close the N idle consoles, resume a stopped console); Enter runs, Shift+Enter edits steps (toggle a step's confirmed/skipped), Alt+Enter runs without focusing; after a run, focus and fit are performed on the page and the results show inline; the dialog takes focus so terminals never see the keys | packages/ui/test/command/CommandBar.test.tsx: pressing ⌘K opens the dialog; typing text and Enter posts /api/command/plan and renders the steps | Playwright-ready selectors: dialog "Command bar", textbox "Command", buttons "Run N steps", "Edit steps"; every control is keyboard-reachable and the e2e smoke stays green |
| L54 | `transcribe(audio: Buffer, mime, settings, home)`: temp file, runs `settings.voice.transcribeCommand` (split with the existing arg splitting used for custom agents) with the path appended, 30 s timeout, trims stdout, deletes the file, returns `{text, ms, engine}`; `POST /api/voice/transcribe` reading a raw body up to 10 MB; 412 with a one-line hint when no command is configured; `packages/e2e/fake-transcriber/index.mjs` printing "close the two idle consoles and resume the docs pass" (or the contents of `FAKE_TRANSCRIPT`) | packages/daemon/test/voice/transcribe.test.ts: with the fake transcriber the response text is the fixed sentence and the temp file is gone afterwards | A missing command and a failing command both answer with a clear error; nothing is written outside `AGENTBOARD_HOME` |
| L55 | `useVoice`: hold Alt+Space to record with `MediaRecorder`, release to stop and post; a "listening" chip in the top bar; the voice dialog (transcript, plan with asks steps marked, Confirm step / Skip it buttons, "Type instead" opening the command bar with the transcript, Cancel); the plan's `reply` spoken with `speechSynthesis` and shown under "Spoken reply"; saying "confirm" during a second hold confirms the asking steps; settings fields for the transcriber command and the planner URL and model under new sections "Voice" and "Command planner" | packages/ui/test/voice/useVoice.test.tsx: with a fake MediaRecorder, keydown Alt+Space then keyup posts the blob to /api/voice/transcribe and renders the transcript | The microphone permission prompt happens on the first hold only; no network except the daemon; the e2e smoke stays green |
| L56 | `command.spec.ts`: open ⌘K, type "fit all consoles", the plan shows one safe step, Enter runs it; type "close the idle console", the step asks, confirm it, the console is gone from the board and from `agentboard status --json`; `voice.spec.ts`: with Chromium's fake media stream flags and the fake transcriber configured, hold Alt+Space, release, the transcript and plan appear, the spoken reply text shows, confirm, the two idle consoles close and the stopped one resumes | The two specs, failing until the pieces exist | Both specs run in the gate's e2e with the fake agent and fake transcriber only |

## Phase gate (owner)

Open a `needs-owner` issue when L50 to L56 are merged: install whisper.cpp, set the transcriber command in settings, hold ⌥Space and say "fit all consoles"; the board fits and the reply is spoken. Optionally point the planner at a local Ollama model and compare its plan with the rules on the canvas's two utterances.
