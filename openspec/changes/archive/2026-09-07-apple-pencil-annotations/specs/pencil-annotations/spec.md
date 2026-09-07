## ADDED Requirements

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

### Requirement: Stroke Capture and Persistence

The system SHALL capture freehand pointer input (including Apple Pencil) as a sequence of coordinate points and persist it as a note bound to the paper and page it was drawn on.

#### Scenario: A completed stroke is saved as a note

- **WHEN** a user draws one or more strokes in pen mode and confirms saving
- **THEN** the system SHALL create a note record containing the captured strokes, associated with the current paper and page number

#### Scenario: An empty stroke is not saved

- **WHEN** a user taps in pen mode without dragging, producing a stroke with no recorded points
- **THEN** the system SHALL NOT create a note record for that stroke

#### Scenario: Saved strokes reappear after reload

- **WHEN** a user reloads the paper page after saving strokes
- **THEN** the system SHALL render the previously saved strokes on the corresponding page

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

### Requirement: Mutually Exclusive Note Content

The system SHALL treat each note as containing either typed text or drawn strokes, and SHALL NOT store both on the same note record.

#### Scenario: A stroke-based note has no text content

- **WHEN** the system creates a note from captured strokes
- **THEN** the resulting note record SHALL have its text content field empty and its strokes field populated

#### Scenario: A typed note has no stroke content

- **WHEN** the system creates a note from typed text (existing note creation flow)
- **THEN** the resulting note record SHALL have its strokes field empty and its text content field populated
