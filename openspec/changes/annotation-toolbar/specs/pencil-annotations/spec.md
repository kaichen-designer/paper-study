## ADDED Requirements

### Requirement: Tool Selection

The system SHALL provide a toolbar, visible only while pen mode is active, that lets the user select between a pen tool and an eraser tool, and SHALL default to the pen tool each time pen mode is activated.

#### Scenario: Pen tool is selected by default on entering pen mode

- **WHEN** a user activates the pen mode toggle
- **THEN** the toolbar SHALL show the pen tool as selected

#### Scenario: Switching to the eraser tool changes drawing input to erasing

- **WHEN** a user selects the eraser tool from the toolbar
- **THEN** subsequent pointer drags on the page SHALL erase intersecting strokes instead of drawing new ones

#### Scenario: Tool selection resets when pen mode is re-entered

- **WHEN** a user deactivates pen mode while the eraser tool is selected, then reactivates pen mode
- **THEN** the toolbar SHALL show the pen tool as selected again

### Requirement: Stroke Color Selection

The system SHALL provide a fixed palette of colors in the toolbar, and SHALL apply the currently selected color to every new stroke drawn after the selection, without altering the color of strokes drawn earlier.

#### Scenario: A newly drawn stroke uses the selected color

- **WHEN** a user selects a color from the palette and then draws a stroke
- **THEN** the system SHALL record that color on the new stroke

#### Scenario: Changing color does not affect existing strokes

- **WHEN** a user draws a stroke in one color, then selects a different color
- **THEN** the previously drawn stroke SHALL keep its original color

### Requirement: Stroke Width Selection

The system SHALL provide a fixed set of width options in the toolbar, and SHALL apply the currently selected width to every new stroke drawn after the selection, without altering the width of strokes drawn earlier.

#### Scenario: A newly drawn stroke uses the selected width

- **WHEN** a user selects a width option and then draws a stroke
- **THEN** the system SHALL record that width on the new stroke

#### Scenario: Changing width does not affect existing strokes

- **WHEN** a user draws a stroke at one width, then selects a different width
- **THEN** the previously drawn stroke SHALL keep its original width

### Requirement: Whole-Stroke Erasing

The system SHALL, while the eraser tool is active, delete an entire existing stroke (and the note record it belongs to) as soon as the eraser path intersects any part of that stroke, without requiring a separate confirmation step.

#### Scenario: Dragging the eraser over a stroke deletes it immediately

- **WHEN** a user drags the eraser tool across any point of an existing stroke
- **THEN** the system SHALL remove that stroke from the page and delete its underlying note record

#### Scenario: A deleted stroke does not reappear after reload

- **WHEN** a user erases a stroke and then reloads the paper page
- **THEN** the system SHALL NOT render the erased stroke

#### Scenario: Erasing does not affect strokes the eraser path does not touch

- **WHEN** a user erases one stroke on a page that has multiple strokes
- **THEN** strokes not intersected by the eraser path SHALL remain on the page

##### Example: eraser hit-test threshold

| Eraser path distance to stroke segment | Stroke width | Erased? |
| --- | --- | --- |
| 1px | 2px | yes |
| 15px | 2px | no |
| 15px | 8px | yes |

#### Scenario: A failed deletion keeps the stroke visible

- **WHEN** a user erases a stroke but the underlying delete request fails
- **THEN** the system SHALL keep the stroke visible on the page rather than removing it optimistically

## MODIFIED Requirements

### Requirement: Cross-Device Coordinate Alignment

The system SHALL store stroke coordinates normalized to the page's rendered dimensions so that saved strokes remain visually aligned with the underlying page content regardless of the viewport size or zoom level used to view them later. Each stroke MAY additionally carry a color and a width; when a stored stroke has no color or width recorded, the system SHALL render it using the default color and default width used before this capability existed.

#### Scenario: Strokes remain aligned when viewed on a different screen width

- **WHEN** a user draws a stroke while viewing a paper at one rendered page width, then reopens the same paper on a device where the page renders at a different width
- **THEN** the system SHALL position the stroke at the same relative location on the page content in both cases

##### Example: normalization round-trip

| Recorded pixel point | Page size at draw time | Normalized point | Page size at redraw time | Rendered pixel point |
| --- | --- | --- | --- | --- |
| (400, 300) | 800x600 | (0.5, 0.5) | 600x450 | (300, 225) |
| (80, 60) | 800x600 | (0.1, 0.1) | 1000x750 | (100, 75) |

#### Scenario: A stroke recorded before color/width support still renders

- **WHEN** the system renders a saved stroke that has no color or width field
- **THEN** the system SHALL display it using the default color and default width
