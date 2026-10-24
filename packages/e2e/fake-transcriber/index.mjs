// Stands in for whisper in the e2e (ruling D31): prints a fixed sentence, or fails when FAKE_TRANSCRIBER_FAIL is set.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

// FAKE_TRANSCRIBER_SLEEP=<ms> waits first, to exercise the timeout.
if (process.env.FAKE_TRANSCRIBER_SLEEP) await sleep(Number(process.env.FAKE_TRANSCRIBER_SLEEP));

if (process.env.FAKE_TRANSCRIBER_FAIL) {
  process.stderr.write("fake failure\n");
  process.exit(1);
}
process.stdout.write((process.env.FAKE_TRANSCRIPT ?? "close the two idle consoles and resume the docs pass") + "\n");
