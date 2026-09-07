import { describe, expect, it } from "vitest";
import { hashText } from "./hash";

describe("hashText", () => {
  it("produces the same hash for the same text", () => {
    expect(hashText("the model achieves 95% accuracy")).toBe(
      hashText("the model achieves 95% accuracy")
    );
  });

  it("produces a different hash for different text", () => {
    expect(hashText("text A")).not.toBe(hashText("text B"));
  });

  it("produces a hex string", () => {
    expect(hashText("hello")).toMatch(/^[0-9a-f]+$/);
  });
});
