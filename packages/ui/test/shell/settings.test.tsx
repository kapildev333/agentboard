import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel, type Settings } from "../../src/shell";

afterEach(cleanup);
const settings: Settings = { fontSize: 14, customAgents: [{ name: "aider", command: "aider --yes" }] };

describe("SettingsPanel", () => {
  it("the settings panel reports a font size change", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("font size"), { target: { value: "18" } });
    expect(onChange).toHaveBeenCalledWith({ ...settings, fontSize: 18 });
  });

  it("font size is clamped to 10..24", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("font size"), { target: { value: "40" } });
    expect(onChange).toHaveBeenCalledWith({ ...settings, fontSize: 24 });
  });

  it("adds and edits a custom agent", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("needs-you regex 0"), { target: { value: "\\? $" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      customAgents: [{ name: "aider", command: "aider --yes", needsYou: "\\? $" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    expect(onChange.mock.lastCall![0].customAgents).toHaveLength(2);
  });
});
