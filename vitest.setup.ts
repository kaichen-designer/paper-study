import "@testing-library/jest-dom/vitest";

// jsdom does not implement PointerEvent. Minimal polyfill (extends
// MouseEvent, matching the real spec) so components using pointer events
// (e.g. AnnotationCanvas) can be tested with `new PointerEvent(...)`.
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    pressure: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.pressure = params.pressure ?? 0;
    }
  }

  // @ts-expect-error — polyfill assigned to the global for jsdom only
  globalThis.PointerEvent = PointerEventPolyfill;
}
