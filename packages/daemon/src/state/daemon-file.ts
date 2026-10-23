import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DaemonInfoSchema, type DaemonInfo } from "@agentboard/shared";
import { daemonFilePath } from "./paths.js";

export class DaemonFile {
  async read(): Promise<DaemonInfo | null> {
    try {
      return DaemonInfoSchema.parse(JSON.parse(await readFile(daemonFilePath(), "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async write(info: DaemonInfo): Promise<void> {
    const file = daemonFilePath();
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    // mode only applies on create, so a stale looser file is removed first
    await rm(file, { force: true });
    await writeFile(file, JSON.stringify(info), { mode: 0o600 });
  }

  async remove(): Promise<void> {
    await rm(daemonFilePath(), { force: true });
  }
}
