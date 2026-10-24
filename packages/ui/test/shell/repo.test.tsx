import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoPicker } from "../../src/shell";

afterEach(cleanup);

describe("RepoPicker", () => {
  it("the repo picker opens a typed path", () => {
    const onOpen = vi.fn();
    render(<RepoPicker recent={["/a"]} onOpen={onOpen} />);
    fireEvent.change(screen.getByLabelText("repo path"), { target: { value: "/typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith("/typed");
  });

  it("choosing a recent repo opens it", () => {
    const onOpen = vi.fn();
    render(<RepoPicker recent={["/a", "/b"]} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("/b"));
    expect(onOpen).toHaveBeenCalledWith("/b");
  });

  it("the launch page lists recent repos with their names and opens one on click", () => {
    const onOpen = vi.fn();
    render(<RepoPicker recent={[{ path: "/w/alpha", consoles: 3 }, "/w/beta"]} onOpen={onOpen} />);
    const alpha = screen.getByRole("button", { name: /alpha/ });
    expect(alpha.querySelector(".recent-name")!.textContent).toBe("alpha");
    expect(alpha.textContent).toContain("/w/alpha");
    expect(alpha.querySelector(".chip")!.textContent).toBe("3 consoles");
    expect(screen.getByRole("button", { name: /beta/ }).querySelector(".chip")).toBeNull();
    fireEvent.click(alpha);
    expect(onOpen).toHaveBeenCalledWith("/w/alpha");
  });

  it("a command's Copy button writes it to the clipboard and says Copied", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RepoPicker recent={[]} onOpen={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy agentboard open ." })));
    expect(writeText).toHaveBeenCalledWith("agentboard open .");
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  it("the agents card lists each agent on PATH and Rescan asks again", async () => {
    const agents = [
      { id: "claude", command: "claude", version: "2.1.0", available: true },
      { id: "codex", command: "codex", version: null, available: false },
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify(agents)));
    render(<RepoPicker recent={[]} onOpen={() => {}} fetch={fetch} />);
    const card = screen.getByRole("region", { name: "Agents on PATH" });
    expect((await within(card).findByText("2.1.0")).closest("li")!.textContent).toContain("claude");
    expect(within(card).getByText("not installed").closest("li")!.querySelector('[data-available="false"]')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/agents");
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Rescan" })));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
