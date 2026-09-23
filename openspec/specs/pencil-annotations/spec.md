# pencil-annotations Specification

## Purpose

Handwritten annotation on the PDF reading view with an Apple Pencil:
capturing strokes, keeping them aligned to the page content, and
persisting them as notes.

## Requirements

### Requirement: Pen Mode Toggle

The system SHALL provide a visible control to toggle pen mode on the PDF reading view, and SHALL only capture drawing input while pen mode is active.

#### Scenario: Enabling pen mode suspends normal page interaction

- **WHEN** a user activates the pen mode toggle
- **THEN** the system SHALL suspend page scrolling, pinch-zoom, and text-selection handling on the PDF page, and SHALL begin capturing pointer input as drawing strokes

#### Scenario: Disabling pen mode restores normal reading interaction

- **WHEN** a user deactivates the pen mode toggle
- **THEN** the system SHALL stop capturing pointer input as drawing strokes and SHALL restore normal page scrolling, pinch-zoom, and text-selection handling

#### Scenario: Pointer input outside pen mode is not captured as drawing

- **WHEN** a user touches or drags on the PDF page while pen mode is inactive
- **THEN** the system SHALL NOT create or modify any stroke data

---
### Requirement: Stroke Capture and Persistence

The system SHALL capture freehand pointer input (including Apple Pencil) as a sequence of coordinate points and persist it as a note bound to the paper and page it was drawn on.

#### Scenario: A completed stroke is saved as a note

- **WHEN** a user draws one or more strokes in pen mode and confirms saving
- **THEN** the system SHALL create a note record containing the captured strokes, associated with the current paper and page number

#### Scenario: A tap is saved as a dot

- **WHEN** a user taps in pen mode without dragging, so the press and release are recorded at the same position
- **THEN** the system SHALL save that stroke and render it as a dot

#### Scenario: A press with no release is not saved

- **WHEN** a pointer is pressed in pen mode and no release is recorded
- **THEN** the system SHALL NOT create a note record for that stroke

#### Scenario: A stroke that cannot be persisted is reported

- **WHEN** saving a stroke fails and the retry also fails
- **THEN** the system SHALL tell the user that the stroke was not saved, rather than leaving it on screen to disappear on the next reload

#### Scenario: Saved strokes reappear after reload

- **WHEN** a user reloads the paper page after saving strokes
- **THEN** the system SHALL render the previously saved strokes on the corresponding page

---
### Requirement: Cross-Device Coordinate Alignment

The system SHALL store stroke coordinates normalized to the page's rendered dimensions so that saved strokes remain visually aligned with the underlying page content regardless of the viewport size or zoom level used to view them later.

#### Scenario: Strokes remain aligned when viewed on a different screen width

- **WHEN** a user draws a stroke while viewing a paper at one rendered page width, then reopens the same paper on a device where the page renders at a different width
- **THEN** the system SHALL position the stroke at the same relative location on the page content in both cases

##### Example: normalization round-trip

| Recorded pixel point | Page size at draw time | Normalized point | Page size at redraw time | Rendered pixel point |
| --- | --- | --- | --- | --- |
| (400, 300) | 800x600 | (0.5, 0.5) | 600x450 | (300, 225) |
| (80, 60) | 800x600 | (0.1, 0.1) | 1000x750 | (100, 75) |

---
### Requirement: Mutually Exclusive Note Content

The system SHALL treat each note as containing either typed text or drawn strokes, and SHALL NOT store both on the same note record.

#### Scenario: A stroke-based note has no text content

- **WHEN** the system creates a note from captured strokes
- **THEN** the resulting note record SHALL have its text content field empty and its strokes field populated

#### Scenario: A typed note has no stroke content

- **WHEN** the system creates a note from typed text (existing note creation flow)
- **THEN** the resulting note record SHALL have its strokes field empty and its text content field populated

---
### Requirement: Drawing Responsiveness

The system SHALL keep the cost of drawing independent of how much has already been drawn on the page, and SHALL NOT let unrelated updates re-render saved ink while a stroke is in progress.

#### Scenario: Frame cost does not grow with page density

- **WHEN** a user draws on a page holding many saved strokes
- **THEN** the system SHALL render at the same rate as it does on an empty page

#### Scenario: A save landing mid-stroke does not disturb the stroke being drawn

- **WHEN** an earlier stroke's save completes while the pen is still down
- **THEN** the system SHALL defer taking on that result until the pen is lifted, and SHALL NOT clear or resize the surface the current stroke is being drawn on

---
### Requirement: Pen Input Is Not Reinterpreted

The system SHALL prevent a stylus drag in pen mode from being taken as a text-selection gesture, anywhere on screen.

#### Scenario: Drawing never selects text

- **WHEN** a user draws in pen mode, over the page, the toolbar, or any panel beside them
- **THEN** the system SHALL NOT begin a text selection, and SHALL dismiss any selection that already exists

#### Scenario: Selection returns when pen mode ends

- **WHEN** a user leaves pen mode
- **THEN** the system SHALL restore text selection, which is how translation is invoked

---

## Investigation notes

Recorded so this is not re-derived from scratch. Each of these was
measured on-device, not reasoned about.

**Ruled out as causes of drawing lag.** JavaScript work (the pointermove
handler measures 0.0ms); the path-building algorithm (0.02-0.2ms per
move at realistic stroke lengths, against an 8.3ms budget); eraser
hit-testing (0.34ms with 100 strokes on the page).

**Ruled out as causes of lost strokes.** Lost pointer events: stylus
contacts, document-level pen presses, and presses reaching the canvas
all match exactly. Palm rejection: cancelled strokes and touches during
strokes both stay at zero. `touch-action`: setting it to `none` detected
FEWER hard, short jabs than `pinch-zoom`, so the default is the better
of the two.

**Unresolved, and not fixable here.** A hard, short, fast jab is
sometimes discarded by iPadOS before it reaches the browser: it produces
no pointer event and no touch event of any kind, with the hand off the
screen. Roughly one in ten. Nothing in the page can observe or recover
it.

**On measuring.** Every wrong conclusion in this investigation came from
comparing numbers taken under different conditions, or from trusting an
instrument that could not detect what it was being used to rule out:

- A frame interval of 33ms was attributed first to page density and then
  to added compositing layers. It was Low Power Mode. The 17ms baseline
  it was compared against had been recorded on a different day.
- `started == ended-up` was used to rule out lost strokes. A stroke that
  never starts increments neither, so that equality holds no matter how
  many are lost.
- A render counter reported through a state update on every render,
  which rendered, which counted again: it measured its own loop at ~1600
  renders per stroke.
- A contact counter counted every touch including the palm, then got
  compared against a pen-only counter.
- `touch-action` was dismissed early on the grounds that it did not
  change first-move latency, which is a different question from whether
  a contact is discarded at all.

Compare within one build, one device state, one session. An instrument
that cannot fail is not evidence.
