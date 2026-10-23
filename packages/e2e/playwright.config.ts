import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testIgnore: ["fake-agent/**"],
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  use: {
    viewport: { width: 1920, height: 1080 },
    // swiftshader gives headless Chromium a WebGL context without a GPU
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
});
