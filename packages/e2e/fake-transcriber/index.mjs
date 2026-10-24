// Stands in for whisper in the e2e (ruling D31): prints a fixed sentence, or fails when FAKE_TRANSCRIBER_FAIL is set.
import process from "node:process";

if (process.env.FAKE_TRANSCRIBER_FAIL) {
  console.error("fake failure");
  process.exit(1);
}
console.log(process.env.FAKE_TRANSCRIPT ?? "close the two idle consoles and resume the docs pass");
