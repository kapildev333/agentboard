import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { LoopListSchema, type Loop } from "@agentboard/shared";
import { agentboardHome } from "../state/index.js";

/** `<home>/loops.json` (P4-D49), written the way the state store writes a board: tmp, sync, rename. */
export class LoopStore {
  private chain: Promise<void> = Promise.resolve();
  private file = () => join(agentboardHome(), "loops.json");

  async load(): Promise<Loop[]> {
    const file = this.file();
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    try {
      return LoopListSchema.parse(JSON.parse(text));
    } catch (e) {
      // kept for the owner to inspect, never deleted
      const aside = `${file}.corrupt-${Date.now()}`;
      await rename(file, aside);
      console.error(`agentboard: ${file} is not a loop list (${(e as Error).message.split("\n")[0]}); moved it to ${aside}`);
      return [];
    }
  }

  /** Serialized, so the last save is the one on disk; a failure is logged and the next save retries. */
  save(loops: Loop[]): Promise<void> {
    const text = JSON.stringify(loops, null, 2);
    const run = this.chain.then(async () => {
      const file = this.file();
      await mkdir(agentboardHome(), { recursive: true, mode: 0o700 });
      const fh = await open(`${file}.tmp`, "w");
      try {
        await fh.writeFile(text);
        await fh.sync();
      } finally {
        await fh.close();
      }
      await rename(`${file}.tmp`, file);
    });
    this.chain = run.catch((e) => console.error("agentboard: loops write failed:", (e as Error).message));
    return this.chain;
  }

  flush(): Promise<void> {
    return this.chain;
  }
}
