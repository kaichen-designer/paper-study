## ADDED Requirements

### Requirement: Model Fallback After Exhausted Transient Retries

The shared Gemini API client SHALL export a function `callGeminiWithFallback` that accepts `prompt`, `apiKey`, a required `primaryModel`, a required `fallbackModel`, and the optional internal `retryDeps` seam, and resolves to a `GeminiResult`. It SHALL first call `primaryModel` with the full retry behavior defined by the Transient Error Retry requirement. It SHALL call `fallbackModel` if and only if the primary model's final failure is a transient status (500, 502, 503, or 504) after all retries have been exhausted. The fallback call SHALL be a single HTTP attempt with no retries and no backoff sleep. The existing `callGemini` function SHALL remain unchanged in signature and behavior.

The following primary-model outcomes SHALL NOT trigger the fallback, and `callGeminiWithFallback` SHALL return the primary model's result exactly as `callGemini` would: success, HTTP 429, HTTP 401 or 403, any other non-transient non-OK status, a network exception from fetch, and an HTTP 200 response with no text content.

#### Scenario: Fallback succeeds after the primary model exhausts transient retries

- **WHEN** the primary model responds with HTTP 503 on all 5 attempts and the fallback model responds with HTTP 200 and valid content
- **THEN** `callGeminiWithFallback` SHALL return `{ ok: true, text }` with the fallback model's text, after exactly 6 HTTP attempts

##### Example: 503 on primary, success on fallback

- **GIVEN** `primaryModel` is `gemini-3.1-flash-lite`, `fallbackModel` is `gemini-3.6-flash`, and the underlying fetch returns HTTP 503 for every request whose URL contains `gemini-3.1-flash-lite` and HTTP 200 with `{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}` for a request whose URL contains `gemini-3.6-flash`
- **WHEN** `callGeminiWithFallback` is invoked once with an injected sleep
- **THEN** the underlying fetch SHALL have been called exactly 6 times (5 with the primary model URL, then 1 with the fallback model URL), the sleep SHALL have been called exactly 4 times (all before the fallback call), and the result SHALL be `{ ok: true, text: "ok" }`

#### Scenario: Primary model succeeds so the fallback is never used

- **WHEN** the primary model responds with HTTP 503 on attempt 1 and HTTP 200 with valid content on attempt 2
- **THEN** `callGeminiWithFallback` SHALL return the primary model's `{ ok: true, text }` and SHALL NOT send any request to the fallback model

#### Scenario: Non-transient failures do not trigger the fallback

- **WHEN** the primary model fails with HTTP 429, HTTP 401, HTTP 403, HTTP 400, a network exception, or HTTP 200 with no text content
- **THEN** `callGeminiWithFallback` SHALL return the same `{ ok: false, message }` that `callGemini` returns for that failure, and SHALL NOT send any request to the fallback model

##### Example: fallback trigger by primary failure type

| Primary model failure | Fallback model called? | Total fetch calls |
| --------------------- | ---------------------- | ----------------- |
| HTTP 503 on all 5 attempts | Yes | 6 |
| HTTP 500, 502, or 504 on all 5 attempts | Yes | 6 |
| HTTP 429 | No | 1 |
| HTTP 401 or 403 | No | 1 |
| HTTP 400 | No | 1 |
| fetch rejects with an error | No | 1 |
| HTTP 200 with `{"candidates":[]}` | No | 1 |

#### Scenario: Fallback failure returns the primary model's message

- **WHEN** the primary model exhausts transient retries with HTTP 503 and the fallback model also fails (for example HTTP 429, HTTP 503, a network exception, a timeout abort, or an empty response)
- **THEN** `callGeminiWithFallback` SHALL return `{ ok: false, message }` where `message` is the friendly service-busy message for the primary model's final status (for example `Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)`), and SHALL NOT include the fallback model's error text

##### Example: fallback quota exhausted

- **GIVEN** the primary model returns HTTP 503 on all 5 attempts and the fallback model returns HTTP 429
- **WHEN** `callGeminiWithFallback` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 6 times, the fallback model SHALL NOT be retried, and the result SHALL be `{ ok: false, message: "Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)" }`

#### Scenario: Backward-compatible callGemini is unaffected

- **WHEN** an existing caller invokes `callGemini({ prompt, apiKey, model })` and the model returns HTTP 503 on all 5 attempts
- **THEN** `callGemini` SHALL return the friendly service-busy failure after exactly 5 HTTP attempts, SHALL NOT send any request to a second model, and the returned failure object SHALL contain only the `ok` and `message` fields

### Requirement: Fallback Time Budget

`callGeminiWithFallback` SHALL bound its total wall-clock time so that a caller whose route declares `maxDuration` of 60 seconds is not cut off. The client SHALL measure elapsed time from the start of the `callGeminiWithFallback` call using a clock that tests can inject through `retryDeps`. It SHALL use an overall budget of 55000 milliseconds. Before calling the fallback model it SHALL compute the fallback timeout as the smaller of 30000 milliseconds and the overall budget minus the elapsed time. If that timeout is less than 8000 milliseconds, it SHALL skip the fallback and return the primary model's failure. Otherwise it SHALL send the fallback request with an abort signal that fires after the computed timeout. The primary model requests SHALL NOT carry a timeout signal.

#### Scenario: Fallback timeout is capped at 30 seconds

- **WHEN** the primary model exhausts transient retries after 20000 milliseconds of elapsed time
- **THEN** the fallback request SHALL be sent with an abort signal configured for a 30000 millisecond timeout

#### Scenario: Fallback timeout shrinks to the remaining budget

- **WHEN** the primary model exhausts transient retries after 42000 milliseconds of elapsed time
- **THEN** the fallback request SHALL be sent with an abort signal configured for a 13000 millisecond timeout

##### Example: timeout by elapsed time

| Elapsed time when primary retries are exhausted | Fallback sent? | Fallback timeout |
| ----------------------------------------------- | -------------- | ---------------- |
| 20000 ms | Yes | 30000 ms |
| 25000 ms | Yes | 30000 ms |
| 42000 ms | Yes | 13000 ms |
| 47000 ms | Yes | 8000 ms |
| 47001 ms | No (skipped) | not applicable |
| 60000 ms | No (skipped) | not applicable |

#### Scenario: Insufficient remaining budget skips the fallback

- **WHEN** the primary model exhausts transient retries after more than 47000 milliseconds of elapsed time
- **THEN** `callGeminiWithFallback` SHALL NOT send a request to the fallback model and SHALL return the primary model's friendly service-busy failure

#### Scenario: Fallback request that exceeds its timeout fails gracefully

- **WHEN** the fallback request is aborted because its timeout elapsed
- **THEN** `callGeminiWithFallback` SHALL NOT throw, and SHALL return the primary model's friendly service-busy failure

### Requirement: Fallback Decision Logging

`callGeminiWithFallback` SHALL write server-side log lines, prefixed with `[callGemini]`, that make the fallback decision observable. Each fallback-related log line SHALL include the primary model name and the fallback model name. The log lines SHALL NOT include the API key or the prompt text.

#### Scenario: Fallback is triggered and succeeds

- **WHEN** the primary model `gemini-3.1-flash-lite` exhausts transient retries with HTTP 503 and the fallback model `gemini-3.6-flash` succeeds
- **THEN** `console.warn` SHALL have been called with a line containing `[callGemini]`, `falling back`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, and `HTTP 503`, and a second `console.warn` line containing `[callGemini]`, `fallback`, `succeeded`, and `gemini-3.6-flash`

#### Scenario: Fallback is triggered and fails

- **WHEN** the primary model exhausts transient retries with HTTP 503 and the fallback model responds with HTTP 429
- **THEN** `console.error` SHALL have been called with a line containing `[callGemini]`, `gemini-3.6-flash`, and `HTTP 429`

#### Scenario: Fallback is skipped for lack of budget

- **WHEN** the fallback is skipped because the remaining budget is below 8000 milliseconds
- **THEN** `console.warn` SHALL have been called with a line containing `[callGemini]`, `skipping fallback`, and `gemini-3.6-flash`

#### Scenario: No fallback log for non-triggering failures

- **WHEN** the primary model fails with HTTP 429 or succeeds
- **THEN** no log line containing `falling back` SHALL be written
