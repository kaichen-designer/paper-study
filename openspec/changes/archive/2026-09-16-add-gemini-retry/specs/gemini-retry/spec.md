## ADDED Requirements

### Requirement: Transient Error Retry

The shared Gemini API client (`callGemini`) SHALL automatically retry a request when the Gemini API responds with a transient error status (429, 500, 502, 503, or 504), using exponential backoff with jitter between attempts, up to a maximum of 2 retries (3 total HTTP attempts).

#### Scenario: Transient error followed by success

- **WHEN** the Gemini API responds with HTTP 503 on the first attempt and HTTP 200 with valid content on the second attempt
- **THEN** `callGemini` SHALL return `{ ok: true, text }` with the text from the successful attempt, and the caller SHALL NOT observe the intermediate failure

##### Example: retry then succeed

- **GIVEN** the underlying fetch is called and returns HTTP 503 on call 1, then HTTP 200 with `{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}` on call 2
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 2 times, and the result SHALL be `{ ok: true, text: "ok" }`

#### Scenario: Transient error exhausts retries

- **WHEN** the Gemini API responds with a transient error status on every attempt, including the final retry
- **THEN** `callGemini` SHALL return `{ ok: false, message }`, where `message` uses the same `Gemini 回應錯誤(HTTP ${status})${detail}` format as a non-retried failure, after making exactly 3 total HTTP attempts

##### Example: exhausted retries

- **GIVEN** the underlying fetch returns HTTP 503 on all calls
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 3 times, and the result SHALL be `{ ok: false, message: "Gemini 回應錯誤(HTTP 503)..." }`

### Requirement: Non-Retryable Error Fast Path

The shared Gemini API client SHALL NOT retry a request when the Gemini API responds with a non-transient error status (any status other than 429, 500, 502, 503, 504), and SHALL return the failure immediately without any backoff delay.

#### Scenario: Non-retryable error returns immediately

- **WHEN** the Gemini API responds with HTTP 401
- **THEN** `callGemini` SHALL return `{ ok: false, message }` after exactly 1 HTTP attempt, with no retry delay applied

##### Example: unauthorized key

- **GIVEN** the underlying fetch returns HTTP 401 with body `{"error":{"message":"API key invalid"}}`
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 1 time, and the result SHALL be `{ ok: false, message: "Gemini 回應錯誤(HTTP 401):{\"error\":{\"message\":\"API key invalid\"}}" }`

### Requirement: Backward-Compatible Contract

The retry behavior SHALL be internal to `callGemini` and SHALL NOT change its public function signature or the `GeminiResult` return type, so existing callers (`lib/translation/gemini.ts`, `lib/reflection/generate-reply.ts`) require no code changes.

#### Scenario: Existing caller behavior is unaffected

- **WHEN** an existing caller invokes `callGemini({ prompt, apiKey, model })` exactly as before this change
- **THEN** the call SHALL compile and behave identically for the success path, and SHALL only differ in that transient failures are retried before a final result is returned
