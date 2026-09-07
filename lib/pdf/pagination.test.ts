import { describe, expect, it } from "vitest";
import { canGoNext, canGoPrevious, clampPage, nextPage, previousPage } from "./pagination";

describe("clampPage", () => {
  it("keeps a page within [1, totalPages]", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(5, 10)).toBe(5);
    expect(clampPage(11, 10)).toBe(10);
  });
});

describe("nextPage / previousPage", () => {
  it("advances to N+1 when N+1 <= totalPages", () => {
    expect(nextPage(1, 3)).toBe(2);
  });

  it("does not advance past the last page", () => {
    expect(nextPage(3, 3)).toBe(3);
  });

  it("goes back to N-1 when N-1 >= 1", () => {
    expect(previousPage(2, 3)).toBe(1);
  });

  it("does not go before page 1", () => {
    expect(previousPage(1, 3)).toBe(1);
  });
});

describe("canGoNext / canGoPrevious", () => {
  it("reports whether navigation in either direction is currently possible", () => {
    expect(canGoNext(1, 3)).toBe(true);
    expect(canGoNext(3, 3)).toBe(false);
    expect(canGoPrevious(1, 3)).toBe(false);
    expect(canGoPrevious(2, 3)).toBe(true);
  });
});
