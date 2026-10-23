import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const names = ["shared", "daemon", "ui", "cli", "mcp", "plugins", "e2e"];
const src = (n: string) => fileURLToPath(new URL(`packages/${n}/src/index.ts`, import.meta.url));

// Tests import sibling packages from source, so no build is needed before `vitest run`.
const alias = Object.fromEntries(names.map((n) => [`@agentboard/${n}`, src(n)]));

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: names.map((n) => ({
      resolve: { alias },
      test: { name: n, root: `packages/${n}` },
    })),
  },
});
