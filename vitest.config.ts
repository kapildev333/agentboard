import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const names = ["shared", "daemon", "ui", "cli", "mcp", "plugins", "e2e"];
const src = (n: string) => fileURLToPath(new URL(`packages/${n}/src/index.ts`, import.meta.url));

// Tests import sibling packages from source, so no build is needed before `vitest run`.
const alias = Object.fromEntries(names.map((n) => [`@agentboard/${n}`, src(n)]));

export default defineConfig({
  test: {
    projects: names.map((n) => ({
      resolve: { alias },
      // e2e specs are Playwright files, run with `npx playwright test` from packages/e2e
      test: { name: n, root: `packages/${n}`, environment: n === "ui" ? "jsdom" : "node", ...(n === "e2e" && { exclude: ["**/node_modules/**", "spike/**", "**/*.spec.ts"] }) },
    })),
  },
});
