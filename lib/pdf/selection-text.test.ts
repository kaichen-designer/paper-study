import { describe, expect, it } from "vitest";
import { joinTextSegments, getSelectionText, type TextSegment } from "./selection-text";

function segment(text: string, rect: Partial<TextSegment["rect"]> = {}): TextSegment {
  return {
    text,
    rect: { top: 0, left: 0, right: 0, bottom: 0, height: 16, ...rect },
  };
}

describe("joinTextSegments", () => {
  it("returns a single segment's text unchanged", () => {
    expect(joinTextSegments([segment("hello")])).toBe("hello");
  });

  it("concatenates two touching segments on the same line without adding a space", () => {
    const segments = [
      segment("hel", { left: 0, right: 20, top: 100, height: 16 }),
      segment("lo", { left: 20, right: 32, top: 100, height: 16 }),
    ];
    expect(joinTextSegments(segments)).toBe("hello");
  });

  it("inserts a space between two segments on the same line separated by a real gap", () => {
    const segments = [
      segment("hello", { left: 0, right: 40, top: 100, height: 16 }),
      segment("world", { left: 48, right: 90, top: 100, height: 16 }),
    ];
    expect(joinTextSegments(segments)).toBe("hello world");
  });

  it("inserts a space between two segments on different lines, so wrapped text doesn't run together", () => {
    const segments = [
      segment("end of line one", { left: 400, right: 480, top: 100, height: 16 }),
      segment("start of line two", { left: 0, right: 60, top: 118, height: 16 }),
    ];
    expect(joinTextSegments(segments)).toBe("end of line one start of line two");
  });

  it("does not add a redundant space when the segment text already has trailing/leading whitespace", () => {
    const segments = [
      segment("hello ", { left: 0, right: 40, top: 100, height: 16 }),
      segment("world", { left: 48, right: 90, top: 100, height: 16 }),
    ];
    expect(joinTextSegments(segments)).toBe("hello world");
  });

  it("skips empty segments", () => {
    const segments = [
      segment("hello", { left: 0, right: 40, top: 100, height: 16 }),
      segment("", { left: 40, right: 40, top: 100, height: 16 }),
      segment("world", { left: 48, right: 90, top: 100, height: 16 }),
    ];
    expect(joinTextSegments(segments)).toBe("hello world");
  });
});

describe("getSelectionText", () => {
  it("reconstructs text across multiple positioned spans, inserting a space at a line break pdf.js's text layer doesn't represent as a character", () => {
    const container = document.createElement("div");
    const lineOneSpan = document.createElement("span");
    lineOneSpan.textContent = "first line";
    const lineTwoSpan = document.createElement("span");
    lineTwoSpan.textContent = "second line";
    container.appendChild(lineOneSpan);
    container.appendChild(lineTwoSpan);

    const range = document.createRange();
    range.setStart(lineOneSpan.firstChild!, 0);
    range.setEnd(lineTwoSpan.firstChild!, lineTwoSpan.textContent!.length);

    // Simulates pdf.js positioning each line's span at a different `top` —
    // the real getBoundingClientRect() would report this; jsdom always
    // reports zeros, so this test injects the measurement pdf.js's layout
    // would actually produce.
    const measure = (node: Text) =>
      node === lineOneSpan.firstChild
        ? { top: 100, left: 0, right: 80, bottom: 116, height: 16 }
        : { top: 130, left: 0, right: 90, bottom: 146, height: 16 };

    expect(getSelectionText(range, container, measure)).toBe("first line second line");
  });

  it("only includes the selected portion of a boundary text node, not the whole node", () => {
    const container = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "hello world";
    container.appendChild(span);

    const range = document.createRange();
    range.setStart(span.firstChild!, 0);
    range.setEnd(span.firstChild!, 5); // just "hello"

    // jsdom's Range has no getBoundingClientRect implementation — supply a
    // trivial measure directly, since a single segment never triggers the
    // spacing logic that needs real positions anyway.
    expect(getSelectionText(range, container, () => ({ top: 0, left: 0, right: 0, bottom: 0, height: 16 }))).toBe(
      "hello"
    );
  });

  it("does not insert a space between touching spans on the same line", () => {
    const container = document.createElement("div");
    const firstSpan = document.createElement("span");
    firstSpan.textContent = "hel";
    const secondSpan = document.createElement("span");
    secondSpan.textContent = "lo";
    container.appendChild(firstSpan);
    container.appendChild(secondSpan);

    const range = document.createRange();
    range.setStart(firstSpan.firstChild!, 0);
    range.setEnd(secondSpan.firstChild!, secondSpan.textContent!.length);

    const measure = (node: Text) =>
      node === firstSpan.firstChild
        ? { top: 100, left: 0, right: 20, bottom: 116, height: 16 }
        : { top: 100, left: 20, right: 32, bottom: 116, height: 16 };

    expect(getSelectionText(range, container, measure)).toBe("hello");
  });
});
