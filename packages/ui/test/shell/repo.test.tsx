import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
