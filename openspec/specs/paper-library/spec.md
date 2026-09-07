## Requirements

### Requirement: User Authentication

The system SHALL require a user to sign in (email or magic link) before accessing any paper library, upload, or note functionality.

#### Scenario: Unauthenticated access is blocked

- **WHEN** an unauthenticated visitor attempts to open the paper library
- **THEN** the system SHALL redirect them to a sign-in flow instead of showing any paper data

#### Scenario: Successful sign-in grants access

- **WHEN** a user completes the email/magic-link sign-in flow
- **THEN** the system SHALL grant them access to their own paper library

### Requirement: Paper List Persistence

The system SHALL persist uploaded papers in cloud storage so they remain available across sessions and devices.

#### Scenario: Paper survives page reload

- **WHEN** a signed-in user uploads a paper and then reloads the application
- **THEN** the uploaded paper SHALL still appear in the user's library list

#### Scenario: Paper visible from a different device

- **WHEN** a user uploads a paper on one device and then signs in with the same account on a second device
- **THEN** the paper SHALL appear in the library list on the second device

### Requirement: Access Scoping

The system SHALL restrict each user's visibility and access to only the papers and data they own.

#### Scenario: User cannot see another user's papers

- **WHEN** user A is signed in
- **THEN** the system SHALL NOT list or allow retrieval of papers uploaded by user B
