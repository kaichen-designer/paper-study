export type TextSegment = {
  text: string;
  rect: { top: number; left: number; right: number; bottom: number; height: number };
};

// A vertical shift larger than this fraction of the previous segment's line
// height counts as wrapping to a new line.
const LINE_BREAK_HEIGHT_RATIO = 0.5;
// A horizontal gap larger than this (in the current rendered page's pixels)
// between two same-line segments counts as a word boundary.
const WORD_GAP_PX = 1;

/**
 * Joins text extracted from separately-positioned DOM nodes (pdf.js renders
 * each text run as its own absolutely-positioned span, with no guaranteed
 * whitespace character between runs) back into readable text — inserting a
 * space wherever the two segments' positions imply one, even though neither
 * segment's own text content has it.
 *
 * Without this, `Selection.toString()` across multiple spans/lines can
 * concatenate words with no separating space, producing text that looks
 * visually complete when highlighted but reads as fused/garbled once
 * extracted.
 */
export function joinTextSegments(segments: TextSegment[]): string {
  let result = "";
  let previous: TextSegment | null = null;

  for (const segment of segments) {
    if (!segment.text) continue;

    if (previous) {
      const verticalShift = Math.abs(segment.rect.top - previous.rect.top);
      const newLine = verticalShift > previous.rect.height * LINE_BREAK_HEIGHT_RATIO;
      const horizontalGap = segment.rect.left - previous.rect.right;
      const needsSpace = newLine || horizontalGap > WORD_GAP_PX;
      const alreadySpaced = /\s$/.test(result) || /^\s/.test(segment.text);

      if (needsSpace && !alreadySpaced) {
        result += " ";
      }
    }

    result += segment.text;
    previous = segment;
  }

  return result;
}

function defaultMeasure(node: Text, start: number, end: number): TextSegment["rect"] {
  const range = node.ownerDocument!.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect();
  return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height };
}

/**
 * Reconstructs the text of a Range, correctly spaced, by walking every text
 * node it intersects (scoped to `container`) and measuring each one's
 * on-page position — see joinTextSegments for why this beats
 * `range.toString()` / `Selection.toString()` for pdf.js's text layer.
 */
export function getSelectionText(
  range: Range,
  container: Node,
  measure: (node: Text, start: number, end: number) => TextSegment["rect"] = defaultMeasure
): string {
  const doc = container.ownerDocument ?? (container as Document);
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });

  const segments: TextSegment[] = [];
  let node = walker.nextNode() as Text | null;

  while (node) {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    const text = node.textContent?.slice(start, end) ?? "";

    if (text) {
      segments.push({ text, rect: measure(node, start, end) });
    }

    node = walker.nextNode() as Text | null;
  }

  return joinTextSegments(segments);
}
