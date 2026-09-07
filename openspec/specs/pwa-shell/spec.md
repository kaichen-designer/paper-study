## Requirements

### Requirement: iOS Installability

The system SHALL provide a web app manifest and iOS-specific meta tags so that the application can be added to an iPad's home screen and launched in standalone mode.

#### Scenario: Add to home screen on iPad Safari

- **WHEN** a user on iPad Safari uses "Add to Home Screen"
- **THEN** the system SHALL install with the configured name and icon, and SHALL launch without browser chrome (standalone display mode) when opened from the home screen icon

### Requirement: App Shell Offline Caching

The system SHALL cache the application shell via a service worker for offline availability, and SHALL NOT precache PDF files.

#### Scenario: App shell loads while offline

- **WHEN** a user with no network connection opens the previously-installed app
- **THEN** the system SHALL display the cached application shell rather than a network error

#### Scenario: PDFs are not precached

- **WHEN** the service worker installs or updates its precache list
- **THEN** the precache list SHALL NOT include PDF file contents

### Requirement: Local Cache Treated as Non-Durable

The system SHALL treat any local (on-device) cache of papers or notes as disposable, and SHALL always be able to recover current data by re-fetching from the backend after local cache loss.

#### Scenario: Local cache eviction does not lose data

- **WHEN** the operating system evicts the application's local storage/cache and the user reopens the app while online
- **THEN** the system SHALL re-fetch papers and notes from the backend and display current data without requiring manual recovery steps
