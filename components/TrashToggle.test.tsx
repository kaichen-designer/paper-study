import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrashToggle from "./TrashToggle";

describe("TrashToggle", () => {
  it("offers the trash with its count while showing the library", () => {
    const onToggle = vi.fn();
    render(<TrashToggle showingTrash={false} onToggle={onToggle} count={3} />);

    const button = screen.getByRole("button", { name: /回收筒/ });
    expect(button).toHaveTextContent("3");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });

  it("offers the way back while showing the trash", () => {
    const onToggle = vi.fn();
    render(<TrashToggle showingTrash onToggle={onToggle} count={0} />);

    fireEvent.click(screen.getByRole("button", { name: "回到論文庫" }));
    expect(onToggle).toHaveBeenCalled();
  });
});
