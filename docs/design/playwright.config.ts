import { defineConfig } from "@playwright/test";

// Takes the screenshots in this folder: `npm run build && npx playwright test -c docs/design/playwright.config.ts`.
// SHOTS=before writes before-*.png instead of the current set.
export default defineConfig({
  testDir: ".",
  testMatch: "shots.ts",
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  // Dark is the default theme; the one light shot emulates the OS preference itself.
  use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
});
