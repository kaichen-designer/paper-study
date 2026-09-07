import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReflectionChat from "./ReflectionChat";
import type { ReflectionMessage } from "@/lib/reflection/queries";

const message = (overrides: Partial<ReflectionMessage>): ReflectionMessage => ({
  id: "m1",
  paper_id: "p1",
  user_id: "u1",
  role: "user",
  content: "預設訊息",
  created_at: "2026-08-31T00:00:00.000Z",
  ...overrides,
});

describe("ReflectionChat", () => {
  it("renders existing messages, distinguishing user and AI turns", () => {
    render(
      <ReflectionChat
        messages={[
          message({ id: "m1", role: "user", content: "我的心得" }),
          message({ id: "m2", role: "assistant", content: "AI 的回饋" }),
        ]}
        onSubmit={vi.fn()}
      />
    );

    const userTurn = screen.getByText("我的心得").closest("[data-role]");
    const aiTurn = screen.getByText("AI 的回饋").closest("[data-role]");
    expect(userTurn).toHaveAttribute("data-role", "user");
    expect(aiTurn).toHaveAttribute("data-role", "assistant");
  });

  it("can be used at any time — the submit button is not gated by reading progress", () => {
    render(<ReflectionChat messages={[]} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /送出/ })).not.toBeDisabled();
  });

  it("submits the typed message and clears the input on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<ReflectionChat messages={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("心得"), { target: { value: "我覺得這篇在講 ABC" } });
    fireEvent.click(screen.getByRole("button", { name: /送出/ }));

    expect(onSubmit).toHaveBeenCalledWith("我覺得這篇在講 ABC");
    await waitFor(() =>
      expect((screen.getByLabelText("心得") as HTMLTextAreaElement).value).toBe("")
    );
  });

  it("keeps the typed message in the input and shows a visible error when submission fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, message: "額度用罄" });
    render(<ReflectionChat messages={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("心得"), { target: { value: "我的心得內容" } });
    fireEvent.click(screen.getByRole("button", { name: /送出/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("額度用罄"));
    expect((screen.getByLabelText("心得") as HTMLTextAreaElement).value).toBe("我的心得內容");
  });
});
