import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel, type Settings } from "../../src/shell";

afterEach(cleanup);
const settings: Settings = { fontSize: 14, customAgents: [{ name: "aider", command: "aider --yes" }] };

describe("SettingsPanel", () => {
  it("the settings panel reports a font size change", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    const input = screen.getByLabelText("font size");
    fireEvent.change(input, { target: { value: "18" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...settings, fontSize: 18 });
  });

  it("font size is clamped to 10..24", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    const input = screen.getByLabelText("font size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.blur(input);
    expect(input.value).toBe("24");
    expect(onChange).toHaveBeenCalledWith({ ...settings, fontSize: 24 });
  });

  it("adds and edits a custom agent", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("needs-you regex 1"), { target: { value: "\\? $" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      customAgents: [{ name: "aider", command: "aider --yes", needsYou: "\\? $" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    expect(onChange.mock.lastCall![0].customAgents).toHaveLength(2);
  });

  it("typing 18 passes through 1 without clamping", () => {
    render(<SettingsPanel settings={settings} onChange={vi.fn()} />);
    const input = screen.getByLabelText("font size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");
  });

  it("clearing the regex stores undefined", () => {
    const onChange = vi.fn();
    const s: Settings = { fontSize: 14, customAgents: [{ name: "a", command: "b", needsYou: "x" }] };
    render(<SettingsPanel settings={s} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("needs-you regex 1"), { target: { value: "" } });
    expect(onChange.mock.lastCall![0].customAgents[0].needsYou).toBeUndefined();
  });

  it("Remove deletes that agent; inputs count from 1", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    expect(screen.getByLabelText("name 1")).toBeTruthy();
    expect(screen.getByLabelText("command 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove agent 1" }));
    expect(onChange).toHaveBeenCalledWith({ ...settings, customAgents: [] });
  });

  it("a new fontSize prop shows in the input", () => {
    const { rerender } = render(<SettingsPanel settings={settings} onChange={vi.fn()} />);
    rerender(<SettingsPanel settings={{ ...settings, fontSize: 16 }} onChange={vi.fn()} />);
    expect((screen.getByLabelText("font size") as HTMLInputElement).value).toBe("16");
  });

  it("blurring an emptied field keeps the current size", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    const input = screen.getByLabelText("font size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("14");
  });

  it("a fractional size is rounded", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    const input = screen.getByLabelText("font size");
    fireEvent.change(input, { target: { value: "12.4" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ ...settings, fontSize: 12 });
  });
});
