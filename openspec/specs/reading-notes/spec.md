## Requirements

### Requirement: Note Creation

The system SHALL allow a signed-in user to create a note tied to a specific paper, page number, and text selection or anchor.

#### Scenario: Create a note on a selection

- **WHEN** a user selects text on a page and enters note content
- **THEN** the system SHALL create a note record linked to that paper, page number, and selection

### Requirement: Note Persistence

The system SHALL store notes in the backend database as the source of truth, not only in local device storage.

#### Scenario: Note survives local storage being cleared

- **WHEN** a user's local device storage is cleared or evicted and the user reloads the application
- **THEN** previously created notes SHALL still be retrievable from the backend

### Requirement: Cross-Device Note Sync

The system SHALL make a user's notes visible on any device where they sign in with the same account.

#### Scenario: Note created on one device appears on another

- **WHEN** a user creates a note while signed in on device A, then signs in with the same account on device B
- **THEN** the note SHALL appear when viewing the corresponding paper on device B
