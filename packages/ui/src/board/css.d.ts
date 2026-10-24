declare module "*.css";
// Vite and Vitest import JSON natively; the page reads only the version (no fetch).
declare module "*/package.json" {
  export const version: string;
}
