export type NodeCharPosition = { nodeIndex: number; charOffset: number };

const SENTENCE_END_RE = /[.!?。！？]/;

/**
 * Finds the [start, end) bounds of the sentence containing `start`, across
 * an ordered sequence of node texts (e.g. pdf.js's per-run text-layer
 * spans, which routinely split a single sentence across several nodes).
 * Pure/DOM-free so it's directly unit-testable — see expandToSentence for
 * the DOM-facing wrapper.
 */
export function findSentenceBounds(
  nodeTexts: string[],
  start: NodeCharPosition
): { start: NodeCharPosition; end: NodeCharPosition } {
  let end: NodeCharPosition = {
    nodeIndex: nodeTexts.length - 1,
    charOffset: nodeTexts[nodeTexts.length - 1]?.length ?? 0,
  };
  forward: for (let ni = start.nodeIndex; ni < nodeTexts.length; ni++) {
    const text = nodeTexts[ni];
    const from = ni === start.nodeIndex ? start.charOffset : 0;
    for (let ci = from; ci < text.length; ci++) {
      if (SENTENCE_END_RE.test(text[ci])) {
        end = { nodeIndex: ni, charOffset: ci + 1 };
        break forward;
      }
    }
  }

  let begin: NodeCharPosition = { nodeIndex: 0, charOffset: 0 };
  backward: for (let ni = start.nodeIndex; ni >= 0; ni--) {
    const text = nodeTexts[ni];
    const from = ni === start.nodeIndex ? start.charOffset - 1 : text.length - 1;
    for (let ci = from; ci >= 0; ci--) {
      if (SENTENCE_END_RE.test(text[ci])) {
        // The sentence starts right after the previous one's punctuation —
        // skip a single following space, if any, so the result doesn't
        // start with a leading space.
        let boundCi = ci + 1;
        if (text[boundCi] === " ") boundCi += 1;
        begin =
          boundCi < text.length ? { nodeIndex: ni, charOffset: boundCi } : { nodeIndex: ni + 1, charOffset: 0 };
        break backward;
      }
    }
  }

  return { start: begin, end };
}

/**
 * Builds a Range spanning the sentence at (caretNode, caretOffset) — used
 * to let a single tap on the PDF (outside pen mode) select one sentence
 * for translation, instead of requiring a precisely-dragged selection on
 * pdf.js's tightly-packed text layer.
 */
export function expandToSentence(container: Node, caretNode: Text, caretOffset: number): Range | null {
  const doc = container.ownerDocument ?? (container as Document);
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode() as Text | null;
  while (node) {
    textNodes.push(node);
    node = walker.nextNode() as Text | null;
  }

  const startNodeIndex = textNodes.indexOf(caretNode);
  if (startNodeIndex === -1) return null;

  const nodeTexts = textNodes.map((n) => n.textContent ?? "");
  const { start, end } = findSentenceBounds(nodeTexts, { nodeIndex: startNodeIndex, charOffset: caretOffset });

  const range = doc.createRange();
  range.setStart(textNodes[start.nodeIndex], start.charOffset);
  range.setEnd(textNodes[end.nodeIndex], end.charOffset);
  return range;
}
