/**
 * Diagnostic instrumentation for pen-input latency. TEMPORARY — this
 * exists to locate the source of drawing stutter on-device (iPad Safari
 * has no attachable devtools in normal use), not as a permanent feature.
 * Remove once the root cause is fixed and verified.
 *
 * Measures each boundary the input crosses, so the evidence says WHICH
 * layer is slow rather than which one we suspect:
 *
 *   pen hardware -> browser dispatch : inputLatency (event.timeStamp -> handler entry)
 *   handler entry -> handler exit    : handlerMs    (our JavaScript)
 *   handler exit  -> painted frame   : frameMs      (browser parse/paint/composite)
 */

export type MoveSample = {
  /** ms between the OS timestamping the event and our handler running. */
  inputLatency: number;
  /** ms spent inside our own pointermove handler. */
  handlerMs: number;
  /** How many raw samples the browser had buffered for this dispatch. */
  coalesced: number;
  /** Points accumulated in the stroke at this moment. */
  pointCount: number;
  /** Characters in the `d` attribute after this move. */
  pathLength: number;
};

export type StrokeReport = {
  points: number;
  durationMs: number;
  movesPerSecond: number;
  /** Raw pen samples per second, if coalesced events are available. */
  samplesPerSecond: number;
  inputLatency: Stats;
  handlerMs: Stats;
  /** Interval between painted frames during the stroke — the stutter signal. */
  frameMs: Stats;
  /** Frames slower than 16.7ms (i.e. dropped below 60fps). */
  longFrames: number;
  frameCount: number;
  finalPathLength: number;
  /** Strokes already saved on this page when the stroke was drawn. */
  savedStrokes: number;
  /** ms from pointerup to the next painted frame. */
  releaseToPaintMs: number;
  /**
   * Latency of the very first pointermove of the stroke. Broken out
   * because the delay is concentrated at the start of a gesture: a long
   * stroke's median hides it behind dozens of later, prompt events,
   * which is exactly why it reads as "the pen is slow to start".
   */
  firstMoveLatency: number;
};

export type Stats = { median: number; p95: number; max: number };

export function summarize(values: number[]): Stats {
  if (values.length === 0) return { median: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/**
 * Collects one stroke's worth of samples. A rAF loop runs for the
 * stroke's duration so frame intervals are observed independently of
 * pointer events — a stroke can receive events smoothly while the
 * compositor is starving, and only the frame interval reveals that.
 */
export class InkProfiler {
  private moves: MoveSample[] = [];
  private frameGaps: number[] = [];
  private startedAt = 0;
  private lastFrameAt = 0;
  private rafId: number | null = null;
  private releasedAt: number | null = null;
  private releaseToPaint = 0;

  constructor(private readonly savedStrokes: number) {}

  begin(now: number) {
    this.startedAt = now;
    this.lastFrameAt = now;
    const tick = (t: number) => {
      this.frameGaps.push(t - this.lastFrameAt);
      this.lastFrameAt = t;
      // Only a frame painted at or after the release can be the repaint
      // caused by it — one already in flight when the pen lifted would
      // otherwise be timed as a negative, meaningless interval.
      if (this.releasedAt !== null && this.releaseToPaint === 0 && t >= this.releasedAt) {
        this.releaseToPaint = t - this.releasedAt;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  recordMove(sample: MoveSample) {
    this.moves.push(sample);
  }

  /** Called on pointerup; the rAF loop runs one more frame to time the repaint. */
  markRelease(now: number) {
    this.releasedAt = now;
  }

  end(now: number): StrokeReport {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const durationMs = now - this.startedAt;
    const seconds = durationMs / 1000 || 1;
    const totalCoalesced = this.moves.reduce((sum, m) => sum + Math.max(1, m.coalesced), 0);
    // The first gap is measured from pointerdown rather than a previous
    // frame, so it is not a real inter-frame interval.
    const gaps = this.frameGaps.slice(1);
    return {
      points: this.moves.length,
      durationMs,
      movesPerSecond: this.moves.length / seconds,
      samplesPerSecond: totalCoalesced / seconds,
      inputLatency: summarize(this.moves.map((m) => m.inputLatency)),
      handlerMs: summarize(this.moves.map((m) => m.handlerMs)),
      frameMs: summarize(gaps),
      longFrames: gaps.filter((g) => g > 16.7).length,
      frameCount: gaps.length,
      finalPathLength: this.moves.at(-1)?.pathLength ?? 0,
      firstMoveLatency: this.moves[0]?.inputLatency ?? 0,
      savedStrokes: this.savedStrokes,
      releaseToPaintMs: this.releaseToPaint,
    };
  }
}

/** Instrumentation is opt-in per page load, so normal use pays nothing. */
export function inkDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).get("inkdebug") === "1";
}

/**
 * Lets the drawing surface's `touch-action` be overridden from the URL,
 * so the two candidate values can be compared on one build instead of
 * shipping a guess. `pinch-zoom` (the default) leaves two-finger zoom
 * working but requires WebKit to hold pointer events until it knows the
 * gesture is not a pinch; `none` commits immediately at the cost of that
 * zoom. Only the start of a stroke should differ between them.
 */
export function touchActionOverride(search: string): "none" | "pinch-zoom" | null {
  const value = new URLSearchParams(search).get("inktouch");
  return value === "none" || value === "pinch-zoom" ? value : null;
}

export function formatReport(r: StrokeReport): string {
  const s = (v: Stats) => `${v.median.toFixed(1)}/${v.p95.toFixed(1)}/${v.max.toFixed(1)}`;
  return [
    `${r.points} moves in ${r.durationMs.toFixed(0)}ms  (${r.movesPerSecond.toFixed(0)}/s, ${r.samplesPerSecond.toFixed(0)} pen samples/s)`,
    `FIRST move latency ${r.firstMoveLatency.toFixed(1)} ms   <-- slow to start`,
    `input latency  med/p95/max  ${s(r.inputLatency)} ms`,
    `our handler    med/p95/max  ${s(r.handlerMs)} ms`,
    `FRAME interval med/p95/max  ${s(r.frameMs)} ms   <-- stutter`,
    `long frames (>16.7ms) ${r.longFrames}/${r.frameCount}`,
    `release->paint ${r.releaseToPaintMs.toFixed(1)} ms`,
    `d length ${r.finalPathLength}  saved strokes on page ${r.savedStrokes}`,
  ].join("\n");
}
