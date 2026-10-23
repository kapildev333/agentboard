import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testIgnore: ["fake-agent/**"],
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  // Default Chromium flags: the console renders with xterm's DOM renderer, and forcing SwiftShader GL
  // drops the board to 15 fps under load (the L03 spike sets it for its WebGL check only).
  use: { viewport: { width: 1920, height: 1080 } },
});
