## ADDED Requirements

### Requirement: Automatic Last-Page Detection

The system SHALL record that a paper has been read to its last page automatically, without requiring any explicit user action beyond normal page navigation.

#### Scenario: Navigating to the last page records it

- **WHEN** a user navigates to the last page of a paper's PDF
- **THEN** the system SHALL record that this paper has reached its last page

#### Scenario: Navigating away and back does not lose the record

- **WHEN** a user has previously reached a paper's last page, navigates to an earlier page, and reloads the paper later
- **THEN** the system SHALL still show that paper as having reached its last page

### Requirement: Manual Finished-Reading Mark

The system SHALL let a user explicitly mark a paper as finished reading, and SHALL only allow this action once that paper has been recorded as having reached its last page.

#### Scenario: Marking finished before reaching the last page is not possible

- **WHEN** a user has not yet navigated to a paper's last page
- **THEN** the system SHALL NOT provide a way to mark that paper as finished reading

#### Scenario: Marking finished after reaching the last page

- **WHEN** a user who has reached a paper's last page explicitly marks it as finished reading
- **THEN** the system SHALL record that paper as finished reading, along with the time it was marked

#### Scenario: A finished paper stays finished after reload

- **WHEN** a user reloads a paper that was previously marked as finished reading
- **THEN** the system SHALL still show that paper as finished reading

#### Scenario: A failed mark-as-finished request does not silently succeed

- **WHEN** a user marks a paper as finished reading but the underlying request fails
- **THEN** the system SHALL display an error and SHALL NOT show that paper as finished reading

### Requirement: Reading and Import Status Visibility

The system SHALL display whether each paper has been marked as finished reading, and whether it has been imported into the external paper database, in both the paper library list and the paper reading view.

#### Scenario: An unfinished, unimported paper shows no status badge

- **WHEN** a paper has not been marked as finished reading
- **THEN** the system SHALL NOT display a finished-reading or imported badge for that paper

#### Scenario: A finished paper shows a finished badge

- **WHEN** a paper has been marked as finished reading
- **THEN** the system SHALL display a finished-reading badge for that paper in both the library list and the reading view

#### Scenario: An imported paper shows an imported badge

- **WHEN** a paper has been marked as imported into the external paper database
- **THEN** the system SHALL display an imported badge for that paper in both the library list and the reading view

##### Example: badge combinations

| reached_last_page | finished_reading | imported_to_detabase | Badges shown |
| --- | --- | --- | --- |
| false | false | false | (none) |
| true | false | false | (none) |
| true | true | false | 已讀完 |
| true | true | true | 已讀完, 已匯入 |
