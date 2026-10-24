import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel, type Settings } from "../../src/shell";

afterEach(cleanup);
const settings: Settings = { fontSize: 14, customAgents: [{ id: "aider", name: "aider", command: "aider", args: ["--yes"] }] };

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
      customAgents: [{ id: "aider", name: "aider", command: "aider", args: ["--yes"], needsYou: "\\? $" }],
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
    const s: Settings = { fontSize: 14, customAgents: [{ id: "a", name: "a", command: "b", args: [], needsYou: "x" }] };
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

  it("the Voice and Command planner settings save and clear", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SettingsPanel settings={settings} onChange={onChange} />);
    expect(screen.getByText("whisper-cli -nt -f", { exact: false })).toBeTruthy();
    expect(screen.getByText("alt+space")).toBeTruthy();
    const command = screen.getByLabelText("Transcribe command");
    fireEvent.change(command, { target: { value: "whisper-cli -nt -f" } });
    fireEvent.blur(command);
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, voice: { transcribeCommand: "whisper-cli -nt -f", holdKey: "alt+space" } });

    const url = screen.getByLabelText("Planner URL");
    fireEvent.change(url, { target: { value: "http://localhost:11434" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "llama3" } });
    fireEvent.blur(url);
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, planner: { url: "http://localhost:11434", model: "llama3" } });

    const full: Settings = { ...settings, voice: { transcribeCommand: "w", holdKey: "alt+space" }, planner: { url: "http://localhost:11434", model: "llama3" } };
    rerender(<SettingsPanel settings={full} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Transcribe command"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Transcribe command"));
    expect("voice" in onChange.mock.lastCall![0]).toBe(false);
    fireEvent.change(screen.getByLabelText("Planner URL"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Planner URL"));
    expect("planner" in onChange.mock.lastCall![0]).toBe(false);
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

  it("args are edited as one space-separated field and a new agent gets an id (D25)", () => {
    const onChange = vi.fn();
    render(<SettingsPanel settings={settings} onChange={onChange} />);
    const args = screen.getByLabelText("args 1") as HTMLInputElement;
    expect(args.value).toBe("--yes");
    fireEvent.change(args, { target: { value: "--yes  --model x" } });
    expect(onChange.mock.lastCall![0].customAgents[0].args).toEqual(["--yes", "--model", "x"]);
    fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
    const added = onChange.mock.lastCall![0].customAgents[1];
    expect(added).toMatchObject({ name: "", command: "", args: [] });
    expect(added.id).toMatch(/\S/);
  });

  it("the sections nav lists Terminal, Agents and Safety and the first button takes focus", () => {
    render(<SettingsPanel settings={settings} onChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Terminal", "Agents", "Safety"]);
    expect(document.activeElement).toBe(buttons[0]);
    // the pane opens on Agents, the artboard's first section
    expect(buttons[1].getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByText(/^v\d+\.\d+\.\d+ · MIT$/)).toBeTruthy();
  });

  it("the agents table shows Ready, Heuristic and Not installed from the agent list", async () => {
    const agents = [
      { id: "claude", command: "claude", version: "2.1.0", available: true },
      { id: "codex", command: "codex", version: "0.5.0", available: true },
      { id: "gemini", command: "gemini", version: null, available: false },
      { id: "custom", command: "aider", version: null, available: true, customId: "aider", name: "aider" },
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify(agents)));
    render(<SettingsPanel settings={settings} onChange={vi.fn()} fetch={fetch} />);
    const table = screen.getByRole("table", { name: "Agents found on PATH" });
    const status = async (name: string) => within(await within(table).findByRole("row", { name: new RegExp(`^${name}`) })).getAllByRole("cell")[3].textContent;
    expect(await status("claude")).toBe("Ready");
    expect(await status("codex")).toBe("Heuristic");
    expect(await status("gemini")).toBe("Not installed");
    expect(await status("aider")).toBe("Heuristic");
    expect(fetch).toHaveBeenCalledWith("/api/agents");
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("custom agent cards keep the name, command, args and regex fields", () => {
    render(<SettingsPanel settings={settings} onChange={vi.fn()} />);
    const card = screen.getByRole("group", { name: "Custom agent 1" });
    for (const label of ["name 1", "command 1", "args 1", "needs-you regex 1"]) expect(within(card).getByLabelText(label)).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Remove agent 1" })).toBeTruthy();
  });

  it("clicking Safety keeps it marked when the short last section cannot scroll to the top", () => {
    const { container } = render(<SettingsPanel settings={settings} onChange={vi.fn()} />);
    const pane = container.querySelector<HTMLElement>(".sp-content")!;
    const box = (el: HTMLElement, props: Record<string, number>) =>
      Object.entries(props).forEach(([k, v]) => Object.defineProperty(el, k, { configurable: true, value: v }));
    box(pane, { scrollTop: 400, clientHeight: 600, scrollHeight: 1000 });
    const tops = { Agents: [0, 500], Terminal: [500, 250], Safety: [750, 250] } as const;
    for (const el of container.querySelectorAll<HTMLElement>("[data-section]")) {
      const [offsetTop, offsetHeight] = tops[el.dataset.section as keyof typeof tops];
      box(el, { offsetTop, offsetHeight });
    }
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const safety = within(nav).getByRole("button", { name: "Safety" });
    fireEvent.click(safety);
    fireEvent.scroll(pane);
    expect(safety.getAttribute("aria-current")).toBe("true");
    // scrolling Safety out of view drops the click; scrolled back to the bottom, the last section is marked again
    box(pane, { scrollTop: 0 });
    fireEvent.scroll(pane);
    expect(within(nav).getByRole("button", { name: "Agents" }).getAttribute("aria-current")).toBe("true");
    box(pane, { scrollTop: 400 });
    fireEvent.scroll(pane);
    expect(safety.getAttribute("aria-current")).toBe("true");
  });
});
