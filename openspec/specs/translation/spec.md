## Requirements

### Requirement: Selection Translation

The system SHALL translate a user's selected PDF text into a target language and display the result without altering the original PDF rendering.

#### Scenario: Translate a selection

- **WHEN** a user selects text on a PDF page and triggers translation
- **THEN** the system SHALL display the translated text in a side or overlay panel, leaving the original PDF page rendering unchanged

### Requirement: Server-Side Key Protection

The system SHALL perform all translation-provider API calls from a server-side component, and SHALL NOT expose the translation API key to client-side code.

#### Scenario: Client requests translation

- **WHEN** the frontend needs a translation
- **THEN** it SHALL call a server-side endpoint that holds the translation API key, and the key SHALL NOT appear in any client-delivered JavaScript, network request, or response body

### Requirement: Translation Caching

The system SHALL cache translation results keyed by source text content and target language, and SHALL reuse a cached result instead of calling the translation provider again for identical input.

#### Scenario: Repeated translation of the same text uses the cache

- **WHEN** a user translates the same selected text and target language a second time
- **THEN** the system SHALL return the previously cached translation without making a new call to the translation provider

##### Example: cache hit vs cache miss

| Request | Text hash + target lang seen before? | Provider called? |
| ------- | ------------------------------------- | ----------------- |
| 1st translation of "the model achieves 95% accuracy" → EN-ZH | No | Yes, result cached |
| 2nd translation of same text → EN-ZH | Yes | No, cached result returned |
| Same text → EN-JA (different target lang) | No | Yes, result cached separately |

### Requirement: Translation Failure Handling

The system SHALL surface a visible error to the user when a translation request fails, and SHALL NOT silently show empty or stale content as if it were a successful translation.

#### Scenario: Translation provider call fails

- **WHEN** the server-side call to the translation provider fails (timeout, quota exceeded, or provider error)
- **THEN** the system SHALL return an error response and the frontend SHALL display a visible failure message to the user
