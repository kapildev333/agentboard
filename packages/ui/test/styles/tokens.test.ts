import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AgentIdSchema } from "@agentboard/shared";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../src/styles/tokens.css"), "utf8");
const [dark, light] = css.split("@media (prefers-color-scheme: light)");

describe("tokens.css", () => {
  it("names Inter and JetBrains Mono first in the font stacks", () => {
    expect(dark).toMatch(/--font-sans:\s*"?Inter/);
    expect(dark).toMatch(/--font-mono:\s*"JetBrains Mono"/);
    expect(dark).toMatch(/--text-2xs:\s*11px/);
    expect(dark).toMatch(/--text-xl:\s*20px/);
  });

  it("has a mark fg and bg for every agent, dark and light", () => {
    for (const id of AgentIdSchema.options) {
      for (const theme of [dark, light!]) {
        expect(theme).toMatch(new RegExp(`--mark-${id}-fg:\\s*#[0-9a-f]{6}`));
        expect(theme).toMatch(new RegExp(`--mark-${id}-bg:\\s*#[0-9a-f]{6}`));
      }
    }
  });
});
