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

### Requirement: Translation Panel Independent Scrolling

The system SHALL render the translation panel as a height-bounded region that scrolls internally, so that reading a long translation never requires scrolling the page itself; in the side-by-side arrangement the panel SHALL stay in view while the page scrolls and be no taller than the viewport height minus 1.5rem, and in the stacked arrangement the panel SHALL be no taller than 34 percent of the viewport height.

#### Scenario: Long whole-page translation scrolls inside the panel

- **WHEN** a user translates a whole page and the translated text is taller than the panel height limit
- **THEN** the panel SHALL show a vertical scroll area for the overflow, and scrolling inside the panel SHALL NOT scroll the surrounding page or the paper area

#### Scenario: Action bar stays reachable while reading

- **WHEN** a user has scrolled down inside the translation panel
- **THEN** the panel heading and the two translate buttons SHALL remain pinned at the top of the panel scroll area

#### Scenario: New result starts at the top

- **WHEN** a translation request succeeds while the panel is scrolled partway down
- **THEN** the panel scroll position SHALL be reset to the top so the beginning of the new translation is visible

#### Scenario: Selection and translation visible together in the stacked arrangement

- **WHEN** the reading page is opened in portrait at 820 by 1180 CSS pixels and the reader is scrolled so its top edge is at the top of the viewport
- **THEN** both the paper page area and the top of the translation panel SHALL be visible in the viewport without further scrolling

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
