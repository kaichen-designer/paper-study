## ADDED Requirements

### Requirement: Paper Renaming

The system SHALL allow a signed-in user to change the title of a paper in their library, and SHALL reject a title that is empty once surrounding whitespace is removed.

#### Scenario: Renaming a paper updates the library

- **WHEN** a user renames a paper to a non-empty title
- **THEN** the system SHALL store the trimmed title and display it wherever that paper appears

#### Scenario: A blank title is rejected

- **WHEN** a user submits a title that contains only whitespace
- **THEN** the system SHALL reject the change and SHALL leave the existing title unchanged

##### Example: title trimming

| Submitted title | Stored title | Accepted |
| --- | --- | --- |
| `  Attention Is All You Need  ` | `Attention Is All You Need` | yes |
| `Guidelines for Human-AI Interaction` | `Guidelines for Human-AI Interaction` | yes |
| `   ` | (unchanged) | no |
| `` | (unchanged) | no |

---

### Requirement: Reading Stage

The system SHALL assign every paper exactly one reading stage from `up_next`, `reading`, and `finished`, SHALL default a newly uploaded paper to `up_next`, and SHALL change a paper's stage only when the user asks for it.

#### Scenario: A newly uploaded paper starts as up next

- **WHEN** a user uploads a paper
- **THEN** the system SHALL set that paper's reading stage to `up_next`

#### Scenario: The user moves a paper between stages

- **WHEN** a user selects a different reading stage for a paper
- **THEN** the system SHALL store the selected stage for that paper

#### Scenario: Opening a paper does not change its stage

- **WHEN** a user opens a paper for reading, or reaches its last page
- **THEN** the system SHALL leave that paper's reading stage unchanged

---

### Requirement: Reading Stage Is The Single Source Of Truth For Completion

The system SHALL keep a paper's completion record consistent with its reading stage, and SHALL write both through a single operation so the two can never disagree.

#### Scenario: Moving a paper to finished records completion

- **WHEN** a paper's reading stage is set to `finished`
- **THEN** the system SHALL mark that paper as finished reading and SHALL record the time it was finished

#### Scenario: Moving a paper out of finished clears completion

- **WHEN** a paper whose stage is `finished` is moved to `up_next` or `reading`
- **THEN** the system SHALL mark that paper as not finished reading and SHALL clear the recorded completion time

#### Scenario: Marking a paper finished while reading sets its stage

- **WHEN** a user marks a paper as finished from the reading view
- **THEN** the system SHALL set that paper's reading stage to `finished`

##### Example: stage and completion move together

| Stage before | Action | Stage after | Finished reading | Finished at |
| --- | --- | --- | --- | --- |
| `up_next` | set stage to `reading` | `reading` | false | null |
| `reading` | set stage to `finished` | `finished` | true | set |
| `finished` | set stage to `reading` | `reading` | false | null |
| `up_next` | mark finished from reading view | `finished` | true | set |

---

### Requirement: Library Grouped By Reading Stage

The system SHALL present the paper library grouped by reading stage, and SHALL omit a group that contains no papers.

#### Scenario: Papers appear under their own stage

- **WHEN** a user opens the library holding papers in more than one stage
- **THEN** the system SHALL show each paper under the group matching its reading stage

#### Scenario: An empty stage is not shown

- **WHEN** no paper is in a given reading stage
- **THEN** the system SHALL NOT render a group heading for that stage

---

### Requirement: Paper Removal Is Recoverable

The system SHALL remove a paper from the library without destroying it, SHALL exclude removed papers from the library listing, and SHALL allow the user to restore a removed paper with its reading stage intact.

#### Scenario: Removing a paper hides it from the library

- **WHEN** a user removes a paper
- **THEN** the system SHALL record the time of removal and SHALL NOT list that paper in the library

#### Scenario: A removed paper can be restored

- **WHEN** a user restores a removed paper
- **THEN** the system SHALL list it in the library again, under the reading stage it had before removal

#### Scenario: Removed papers are listed separately

- **WHEN** a user views removed papers
- **THEN** the system SHALL list only removed papers, most recently removed first

---

### Requirement: Permanent Deletion

The system SHALL allow a user to permanently delete a removed paper, SHALL require explicit confirmation stating that the paper's notes and annotations go with it, and SHALL NOT leave a paper record whose file no longer exists.

#### Scenario: Permanent deletion requires confirmation

- **WHEN** a user asks to permanently delete a removed paper
- **THEN** the system SHALL state how many notes and annotations will be destroyed and SHALL proceed only after the user confirms

#### Scenario: Permanent deletion removes the paper and its contents

- **WHEN** a user confirms permanent deletion
- **THEN** the system SHALL delete the paper record together with its notes, annotations, and reflection messages, and SHALL delete the stored PDF file

#### Scenario: A stored file that cannot be deleted does not fail the operation

- **WHEN** the paper record is deleted but its stored PDF file cannot be
- **THEN** the system SHALL treat the deletion as complete, leaving no paper record that points at a missing file
