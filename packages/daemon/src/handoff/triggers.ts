import type { ConsoleStatus } from "@agentboard/shared";
import { nextRole, type HandoffDeps, type HandoffService } from "./service.js";

export type TriggerDeps = {
  tracker: { get(id: string): ConsoleStatus; onChange(cb: (id: string, status: ConsoleStatus, previous: ConsoleStatus) => void): () => void };
  console: HandoffDeps["console"];
  service: Pick<HandoffService, "draft" | "send">;
};

/** Hands a team console's work to the next role when it finishes a turn, for teams with handoffOnIdle. */
export class TeamTriggers {
  readonly stop: () => void;

  constructor(private deps: TriggerDeps) {
    this.stop = deps.tracker.onChange((id, status, previous) => {
      // Only a turn that ends counts: a fresh start that settles idle has nothing to hand off, and since the
      // tracker reports changes only, each working → idle is one idle period and one handoff at most.
      if (status === "idle" && previous === "working") void this.fire(id);
    });
  }

  private async fire(id: string): Promise<void> {
    const team = this.deps.console(id)?.teams.find((t) => t.triggers.handoffOnIdle && t.roles.some((r) => r.consoleId === id));
    const to = nextRole(team, id)?.consoleId;
    if (!team || !to) return;
    const status = this.deps.tracker.get(to);
    const stopped = status === "stopped" || status === "exited";
    // Never into a console that needs you, or one at work (P4-D45).
    if (status !== "idle" && !(stopped && team.triggers.startStopped)) return;
    try {
      const h = await this.deps.service.draft({ fromConsoleId: id, teamId: team.id });
      await this.deps.service.send(h.id, { startStopped: team.triggers.startStopped });
    } catch (e) {
      console.error(`agentboard: automatic handoff from ${id} failed:`, (e as Error).message);
    }
  }
}
