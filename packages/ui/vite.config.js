import { defineConfig } from "vite";

// Relative asset URLs and no source maps, so dist carries no absolute or machine paths.
export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 2000 },
});
