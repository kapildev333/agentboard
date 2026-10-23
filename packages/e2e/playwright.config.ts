import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "spike",
  workers: 1,
  reporter: "list",
  // swiftshader gives headless Chromium a WebGL context without a GPU
  use: { launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } },
});
