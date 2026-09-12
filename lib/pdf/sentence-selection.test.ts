import { describe, expect, it } from "vitest";
import { findSentenceBounds, expandToSentence } from "./sentence-selection";

describe("findSentenceBounds", () => {
  it("finds the sentence containing a tap in the middle of it, within a single text node", () => {
    const text = "First sentence. Second sentence here. Third one.";
    // tap inside "Second sentence here."
    const tapIndex = text.indexOf("Second") + 3;
    const { start, end } = findSentenceBounds([text], { nodeIndex: 0, charOffset: tapIndex });

    const selected = text.slice(start.charOffset, end.charOffset);
    expect(selected).toBe("Second sentence here.");
  });

  it("starts at the very beginning of the text when the tap is in the first sentence", () => {
    const text = "First sentence. Second sentence.";
    const { start, end } = findSentenceBounds([text], { nodeIndex: 0, charOffset: 3 });
    expect(start).toEqual({ nodeIndex: 0, charOffset: 0 });
    expect(text.slice(start.charOffset, end.charOffset)).toBe("First sentence.");
  });

  it("ends at the very end of the text when the tap is in the last sentence (no trailing punctuation)", () => {
    const text = "First sentence. Last sentence with no period";
    const tapIndex = text.indexOf("Last") + 2;
    const { start, end } = findSentenceBounds([text], { nodeIndex: 0, charOffset: tapIndex });
    expect(end).toEqual({ nodeIndex: 0, charOffset: text.length });
    expect(text.slice(start.charOffset, end.charOffset)).toBe("Last sentence with no period");
  });

  it("finds sentence bounds across multiple text nodes, simulating a sentence split by pdf.js's per-run spans", () => {
    // "Hello world. This sentence " + "spans two spans. " + "Next."
    const nodeTexts = ["Hello world. This sentence ", "spans two spans. ", "Next."];
    // tap inside the second node ("spans two spans.")
    const { start, end } = findSentenceBounds(nodeTexts, { nodeIndex: 1, charOffset: 5 });

    expect(start).toEqual({ nodeIndex: 0, charOffset: 13 }); // right after "Hello world. "
    expect(end).toEqual({ nodeIndex: 1, charOffset: 16 }); // the "." in "spans two spans."
  });

  it("rolls over to the start of the next node when the sentence-ending punctuation is the last character of a node", () => {
    const nodeTexts = ["End of one sentence.", "Start of next one."];
    const { start } = findSentenceBounds(nodeTexts, { nodeIndex: 1, charOffset: 5 });
    expect(start).toEqual({ nodeIndex: 1, charOffset: 0 });
  });

  it("handles Chinese full-width sentence punctuation", () => {
    const text = "第一句話。第二句在這裡。第三句。";
    const tapIndex = text.indexOf("第二") + 1;
    const { start, end } = findSentenceBounds([text], { nodeIndex: 0, charOffset: tapIndex });
    expect(text.slice(start.charOffset, end.charOffset)).toBe("第二句在這裡。");
  });
});

describe("expandToSentence", () => {
  it("builds a Range spanning just the sentence at the given caret position, across multiple spans", () => {
    const container = document.createElement("div");
    const spanOne = document.createElement("span");
    spanOne.textContent = "Hello world. This sentence ";
    const spanTwo = document.createElement("span");
    spanTwo.textContent = "spans two spans. ";
    const spanThree = document.createElement("span");
    spanThree.textContent = "Next.";
    container.append(spanOne, spanTwo, spanThree);

    const range = expandToSentence(container, spanTwo.firstChild as Text, 5);

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("This sentence spans two spans.");
  });

  it("returns null when the given node isn't inside the container", () => {
    const container = document.createElement("div");
    container.textContent = "hello";
    const outsideNode = document.createTextNode("outside");

    expect(expandToSentence(container, outsideNode, 0)).toBeNull();
  });
});
