## ADDED Requirements

### Requirement: Responsive Reader Arrangement

The system SHALL arrange the paper area and the translation panel on the reading page according to the viewport width: at 960 CSS pixels and wider the two SHALL sit side by side with the paper area taking 11 parts and the translation panel taking 9 parts of the available row width (the translation panel never narrower than 380 CSS pixels), and below 960 CSS pixels they SHALL be stacked in a single column with the paper area first and the translation panel directly after it.

#### Scenario: Landscape tablet shows paper and translation side by side

- **WHEN** the reading page is opened at a viewport width of 1024 CSS pixels
- **THEN** the paper area and the translation panel SHALL be laid out in one row, with the translation panel at least 380 CSS pixels wide

##### Example: column widths by viewport

| Viewport width | Arrangement | Paper area width | Translation panel width |
| -------------- | ----------- | ---------------- | ----------------------- |
| 768 (portrait) | stacked | full reader width (about 720) | full reader width (about 720) |
| 820 (portrait) | stacked | full reader width (about 772) | full reader width (about 772) |
| 834 (portrait) | stacked | full reader width (about 786) | full reader width (about 786) |
| 1024 (landscape) | side by side | about 528 | about 432 |
| 1180 (landscape) | side by side | about 614 | about 502 |

#### Scenario: Portrait tablet stacks paper above translation

- **WHEN** the reading page is opened at a viewport width of 820 CSS pixels
- **THEN** the paper area SHALL occupy the full reader width and the translation panel SHALL appear below the paper area's page-navigation controls, also at full reader width

#### Scenario: Rotating the device switches the arrangement

- **WHEN** a tablet is rotated from portrait (820 wide) to landscape (1180 wide) while a paper is open
- **THEN** the reading page SHALL switch from the stacked arrangement to the side-by-side arrangement, and the rendered PDF page SHALL be re-fitted to the new paper area width without a manual reload

### Requirement: Reader Page Width

The system SHALL allow the reading page content container to grow up to 1280 CSS pixels wide with 0.75rem horizontal padding, and SHALL NOT apply this wider limit to other pages such as the paper library.

#### Scenario: Large landscape tablet uses the extra width

- **WHEN** the reading page is opened at a viewport width of 1366 CSS pixels
- **THEN** the reading page content container SHALL be wider than 960 CSS pixels and no wider than 1280 CSS pixels

#### Scenario: Library page keeps its existing width limit

- **WHEN** the paper library page is opened at a viewport width of 1366 CSS pixels
- **THEN** its content container SHALL remain no wider than 960 CSS pixels

### Requirement: Paper Page Full Height

The system SHALL render the paper page area on the reading page at its full natural height, with the PDF page fitted to the paper area width and no maximum height and no scroll area of its own, so that the whole PDF page is reachable by scrolling the page itself and no part of it is clipped.

#### Scenario: Whole PDF page is shown without an inner scroll box

- **WHEN** the reading page is opened at 820 by 1180 CSS pixels and a PDF page has finished rendering
- **THEN** the paper page area SHALL be as tall as the rendered PDF page plus its vertical padding, and its scroll height SHALL equal its client height

##### Example: paper area size by viewport

| Viewport width | Arrangement | PDF page width | PDF page height (ratio 1:1.294) | Inner scroll box |
| -------------- | ----------- | -------------- | ------------------------------- | ---------------- |
| 820 (portrait) | stacked | about 772 | about 999 | none |
| 1024 (landscape) | side by side | about 528 | about 683 | none |
| 1366 (landscape) | side by side | about 669 | about 866 | none |

#### Scenario: Page scrolling reaches the lower part of the PDF page

- **WHEN** a user scrolls the reading page down at 1024 by 768 CSS pixels
- **THEN** the lower part of the PDF page SHALL come into view through the page scroll, while the translation panel stays in view beside it

### Requirement: Single Nested Scroll Region

The system SHALL keep the translation panel as the only region on the reading page, apart from the page itself and the source quotation inside the panel, that has its own vertical scroll area, and SHALL allow a scroll gesture that reaches the top or bottom of the panel content to continue scrolling the page instead of being blocked.

#### Scenario: No other region traps vertical scrolling

- **WHEN** the reading page is shown at any of 768 by 1024, 820 by 1180, 834 by 1194, 1024 by 768, 1180 by 820, or 1366 by 1024 CSS pixels
- **THEN** the only element on the page, excluding the source quotation and form text areas, whose computed overflow-y is auto or scroll and whose scroll height exceeds its client height SHALL be the translation panel

#### Scenario: Panel does not hold on to the gesture at its edges

- **WHEN** the translation panel is scrolled to the end of its content and the same gesture continues
- **THEN** the translation panel SHALL NOT use overscroll containment, so the gesture continues to scroll the page

### Requirement: Translation Panel Independent Scrolling

The system SHALL render the translation panel as a height-bounded region that scrolls internally, so that reading a long translation does not require scrolling the page itself; in the side-by-side arrangement the panel SHALL stay in view while the page scrolls and SHALL by default be no taller than 90 percent of the viewport height (which is never more than the viewport height minus 1.5rem for viewports at least 240 CSS pixels high), and in the stacked arrangement the panel SHALL by default be no taller than 34 percent of the viewport height. These defaults SHALL apply until the user sets a height as described in the Translation Panel Height Adjustment requirement.

#### Scenario: Long whole-page translation scrolls inside the panel

- **WHEN** a user translates a whole page and the translated text is taller than the panel height limit
- **THEN** the panel SHALL show a vertical scroll area for the overflow, and scrolling inside the panel SHALL move the panel content before it moves the surrounding page

#### Scenario: Action bar stays reachable while reading

- **WHEN** a user has scrolled down inside the translation panel
- **THEN** the panel heading and the two translate buttons SHALL remain pinned at the top of the panel scroll area

#### Scenario: New result starts at the top

- **WHEN** a translation request succeeds while the panel is scrolled partway down
- **THEN** the panel scroll position SHALL be reset to the top so the beginning of the new translation is visible

#### Scenario: Panel stays beside the paper while the page scrolls in the side-by-side arrangement

- **WHEN** the reading page is shown at 1024 by 768 CSS pixels and the page is scrolled down by 300 CSS pixels
- **THEN** the translation panel SHALL remain fully inside the viewport, with its top edge 0.75rem from the top of the viewport

### Requirement: Translation Panel Height Adjustment

The system SHALL provide a drag handle at the bottom edge of the translation panel that lets the user set the panel height, SHALL accept both pointer drags (finger, stylus, or mouse) and keyboard input, SHALL keep the height between 200 CSS pixels and 90 percent of the viewport height, and SHALL remember the chosen height in the browser's localStorage under the key `translation-panel-height` so that it is applied the next time the reading page is opened. The handle SHALL be at least 44 CSS pixels tall, SHALL expose role `separator` with horizontal orientation and the `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` attributes, and SHALL be the only element given `touch-action: none` by this requirement.

#### Scenario: Dragging the handle changes the panel height

- **WHEN** a user presses the handle with a pointer at a vertical position of 500 and moves to 580 while the panel is 300 CSS pixels tall in a viewport 768 CSS pixels high
- **THEN** the panel height SHALL become 380 CSS pixels, and when the pointer is released 380 SHALL be written to localStorage under `translation-panel-height`

##### Example: drag results

| Start height | Pointer delta | Viewport height | Resulting height | Reason |
| ------------ | ------------- | --------------- | ---------------- | ------ |
| 300 | +80 | 768 | 380 | within limits |
| 300 | -150 | 768 | 200 | clamped to minimum |
| 300 | +900 | 768 | 691 | clamped to 90 percent of 768, rounded down |

#### Scenario: Keyboard adjustment

- **WHEN** the handle has focus and the panel is 300 CSS pixels tall in a viewport 768 CSS pixels high, and the user presses ArrowDown, then ArrowUp twice, then End, then Home
- **THEN** the height SHALL be successively 324, 300, 276, 691, and 200 CSS pixels, with `aria-valuenow` equal to each value

#### Scenario: Stored height is restored

- **WHEN** localStorage holds `translation-panel-height` equal to `420` and the reading page is opened in a viewport 768 CSS pixels high
- **THEN** the panel SHALL be 420 CSS pixels tall and the handle `aria-valuenow` SHALL be 420

#### Scenario: Invalid stored values are ignored

- **WHEN** localStorage holds `translation-panel-height` equal to `abc`, `50`, or `9999`, or reading localStorage throws an error
- **THEN** the panel SHALL use its default height and the translation function SHALL keep working

#### Scenario: Storage failure does not block adjusting

- **WHEN** writing to localStorage throws an error while the user drags the handle
- **THEN** the panel height SHALL still change during the drag, and no error SHALL be shown to the user

#### Scenario: Stored height is limited by a shorter viewport

- **WHEN** a stored height of 700 is applied after the device is rotated to a viewport 600 CSS pixels high
- **THEN** the panel SHALL be no taller than 540 CSS pixels, which is 90 percent of the viewport height

### Requirement: Translation Text Legibility

The system SHALL display translated text at a font size of 1.0625rem with a line height of 1.85, SHALL preserve line breaks returned by the translation provider, SHALL separate paragraphs with a vertical gap of 0.75em, and SHALL limit the text block to a maximum width of 34em so that a line holds roughly 22 to 30 Chinese characters.

#### Scenario: Line breaks in the translation are preserved

- **WHEN** the translation provider returns text containing newline characters
- **THEN** the panel SHALL render each newline as a visible line break instead of collapsing it into a space

#### Scenario: Text block does not exceed the maximum width

- **WHEN** the translation panel is wider than 34em of translated text, as in the stacked arrangement at 820 CSS pixels
- **THEN** the translated text block SHALL be no wider than 34em and SHALL be left-aligned within the panel

#### Scenario: Long source quotation does not push the translation off screen

- **WHEN** a user selects a passage whose source text is taller than 6.5rem when rendered
- **THEN** the source quotation SHALL be limited to a height of 6.5rem with its own vertical scroll, and the translated text SHALL start directly below that limited block

### Requirement: Translation Action Buttons

The system SHALL display the "translate selection" and "translate whole page" buttons on one row with equal widths whenever the panel is at least 300 CSS pixels wide, SHALL wrap them onto separate rows only below that width, and SHALL keep each button at least 44 CSS pixels tall.

#### Scenario: Buttons share one row in the side-by-side arrangement

- **WHEN** the reading page is shown at 1024 CSS pixels wide
- **THEN** both translate buttons SHALL appear on a single row, each at least 44 CSS pixels tall, and neither label SHALL be broken across lines

### Requirement: Secondary Section Readability

The system SHALL limit the note form, note list, and reflection chat on the reading page to a maximum width of 48rem and center them, SHALL render reflection messages without list bullets, and SHALL visually distinguish user messages (aligned to the right with a tinted background) from assistant messages (aligned to the left on a card) using each message role attribute, at a line height of 1.75.

#### Scenario: Reflection messages are distinguishable by role

- **WHEN** the reflection chat contains one user message and one assistant message
- **THEN** the user message SHALL be right-aligned with a tinted background, the assistant message SHALL be left-aligned on a card, and neither SHALL show a list bullet

#### Scenario: Wide viewport does not stretch the chat line length

- **WHEN** the reading page is shown at 1180 CSS pixels wide
- **THEN** the reflection chat container SHALL be no wider than 48rem and SHALL be horizontally centered

### Requirement: Non-Layout Behavior Unchanged

The system SHALL keep translation requests, reflection submissions, note creation, text selection, page navigation, and pen annotation behavior identical to their behavior before this layout change; only presentation and the translation panel internal structure SHALL change.

#### Scenario: Translation request payload is unchanged

- **WHEN** a user triggers "translate selection" with the selected text "hello world" on paper p1
- **THEN** the request body sent to the translation endpoint SHALL be exactly the target language "ZH", the text "hello world", and the paper id "p1", the same as before this change
