## ADDED Requirements

### Requirement: Reflection Message Submission

The system SHALL allow a signed-in user to submit a free-text reflection message about a paper at any time, without requiring the paper to be marked as finished.

#### Scenario: Submitting a reflection while reading

- **WHEN** a user types a reflection message on a paper's reading view and submits it
- **THEN** the system SHALL accept the message regardless of the user's current page or reading progress

### Requirement: Grounded AI Feedback

The system SHALL generate a reply to the user's reflection message using the paper's full text as context, and the reply SHALL address the content of the user's specific message rather than a generic response.

#### Scenario: AI reply references paper content

- **WHEN** the system generates a reply to a submitted reflection message
- **THEN** the request sent to the AI provider SHALL include the paper's extracted full text alongside the user's message

#### Scenario: Reply generation failure does not silently succeed

- **WHEN** the AI provider call fails (timeout, quota exceeded, or provider error)
- **THEN** the system SHALL return an error response and SHALL NOT create a message record for a reply that was never generated

### Requirement: Persistent Cross-Device Conversation

The system SHALL persist reflection messages (both user messages and AI replies) in the backend database, scoped to the paper and the signed-in user, so the conversation is available across reloads and devices.

#### Scenario: Conversation survives a page reload

- **WHEN** a user reloads the reading view for a paper they previously exchanged reflection messages on
- **THEN** the system SHALL display the previous messages in their original chronological order

#### Scenario: Conversation is visible from a second device

- **WHEN** a user who exchanged reflection messages on one device signs in with the same account on a second device and opens the same paper
- **THEN** the system SHALL display the same conversation history

#### Scenario: A user cannot see another user's reflection conversation for the same paper

- **WHEN** user A is signed in
- **THEN** the system SHALL NOT display or allow retrieval of reflection messages created by user B, even for a paper user A also has access to

### Requirement: Full Paper Text Extraction

The system SHALL be able to extract the complete text content of a paper's PDF, across all pages, for use as AI context.

#### Scenario: Extracted text includes all pages in order

- **WHEN** the system extracts the full text of a multi-page PDF
- **THEN** the extracted text SHALL include content from every page, concatenated in page order

#### Scenario: Extraction failure does not block other features

- **WHEN** full-text extraction fails for a given PDF
- **THEN** the reflection chat SHALL display an error state without affecting the paper's translation or note-taking functionality
