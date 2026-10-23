import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
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
    // mode only applies on create, so a stale .tmp is removed first; rename keeps readers from seeing a partial file
    await rm(`${file}.tmp`, { force: true });
    const fh = await open(`${file}.tmp`, "wx", 0o600); // O_EXCL: a tmp file planted after the rm fails the write
    try {
      await fh.writeFile(JSON.stringify(info));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(`${file}.tmp`, file);
  }

  // Only this daemon's own file: a second daemon that refused to start must not delete the live one's.
  async remove(): Promise<void> {
    const info = await this.read().catch(() => null);
    if (info?.pid === process.pid) await rm(daemonFilePath(), { force: true });
  }
}
