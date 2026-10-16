## Requirements

### Requirement: Transient Error Retry

The shared Gemini API client (`callGemini`) SHALL automatically retry a request when the Gemini API responds with a transient server-side error status (500, 502, 503, or 504), using exponential backoff with jitter between attempts, up to a maximum of 4 retries (5 total HTTP attempts). The delay before retry number N (N = 1..4) SHALL be `1000 * 2^(N-1)` milliseconds (1000, 2000, 4000, 8000) plus a random jitter in the range 0 to 500 milliseconds, so the cumulative wait across all retries is at least 15000 milliseconds and less than 17000 milliseconds.

#### Scenario: Transient error followed by success

- **WHEN** the Gemini API responds with HTTP 503 on the first attempt and HTTP 200 with valid content on the second attempt
- **THEN** `callGemini` SHALL return `{ ok: true, text }` with the text from the successful attempt, and the caller SHALL NOT observe the intermediate failure

##### Example: retry then succeed

- **GIVEN** the underlying fetch is called and returns HTTP 503 on call 1, then HTTP 200 with `{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}` on call 2
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 2 times, the injected sleep SHALL have been called exactly 1 time with a value in the range 1000 to less than 1500, and the result SHALL be `{ ok: true, text: "ok" }`

#### Scenario: Transient error exhausts retries

- **WHEN** the Gemini API responds with a transient error status on every attempt, including the final retry
- **THEN** `callGemini` SHALL return `{ ok: false, message }` after making exactly 5 total HTTP attempts, where `message` is the friendly service-busy message defined in the Friendly Error Messages requirement

##### Example: exhausted retries

- **GIVEN** the underlying fetch returns HTTP 503 on all calls
- **WHEN** `callGemini` is invoked once with an injected sleep
- **THEN** the underlying fetch SHALL have been called exactly 5 times, the sleep SHALL have been called exactly 4 times with base delays of 1000, 2000, 4000, and 8000 milliseconds (each plus jitter of less than 500 milliseconds), and the result SHALL be `{ ok: false, message: "Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)" }`

#### Scenario: Success on the last allowed attempt

- **WHEN** the Gemini API responds with HTTP 503 on attempts 1 to 4 and HTTP 200 with valid content on attempt 5
- **THEN** `callGemini` SHALL return `{ ok: true, text }` after exactly 5 HTTP attempts and 4 sleeps

---
### Requirement: Non-Retryable Error Fast Path

The shared Gemini API client SHALL NOT retry a request when the Gemini API responds with a non-transient error status (any status other than 500, 502, 503, 504), and SHALL return the failure immediately without any backoff delay. This SHALL include HTTP 429: Gemini's free tier returns 429 both for short-lived per-minute throttling and for the per-day-per-model quota being exhausted, distinguishable only by the error body's `quotaId`, not by status code — retrying an exhausted daily quota cannot succeed and only spends more of an already-scarce allowance (as low as 20 requests/day/model), so 429 SHALL be treated as non-retryable. The returned `message` SHALL be the friendly message for that status as defined in the Friendly Error Messages requirement.

#### Scenario: Non-retryable error returns immediately

- **WHEN** the Gemini API responds with HTTP 401
- **THEN** `callGemini` SHALL return `{ ok: false, message }` after exactly 1 HTTP attempt, with no retry delay applied

##### Example: unauthorized key

- **GIVEN** the underlying fetch returns HTTP 401 with body `{"error":{"message":"API key invalid"}}`
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 1 time, and the result SHALL be `{ ok: false, message: "Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP 401)" }`

#### Scenario: Quota-exhausted 429 returns immediately without retrying

- **WHEN** the Gemini API responds with HTTP 429 whose body indicates a daily quota (`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`) has been exhausted
- **THEN** `callGemini` SHALL return `{ ok: false, message }` after exactly 1 HTTP attempt, with no retry delay applied, so the remaining daily quota is not spent on retries that cannot succeed

##### Example: daily quota exhausted

- **GIVEN** the underlying fetch returns HTTP 429 with a body reporting `"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"`
- **WHEN** `callGemini` is invoked once
- **THEN** the underlying fetch SHALL have been called exactly 1 time, and the result SHALL be `{ ok: false, message: "Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP 429)" }`

---
### Requirement: Backward-Compatible Contract

The retry behavior SHALL be internal to `callGemini` and SHALL NOT change its public function signature or the `GeminiResult` return type, so existing callers (`lib/translation/gemini.ts`, `lib/reflection/generate-reply.ts`) require no code changes.

#### Scenario: Existing caller behavior is unaffected

- **WHEN** an existing caller invokes `callGemini({ prompt, apiKey, model })` exactly as before this change
- **THEN** the call SHALL compile and behave identically for the success path, and SHALL only differ in that transient failures are retried before a final result is returned

---
### Requirement: Friendly Error Messages

The `message` of every `{ ok: false, message }` result returned by `callGemini` SHALL be a Traditional Chinese, user-presentable sentence chosen by failure type, and SHALL NOT contain the raw response body returned by Gemini. The raw response body (when present) SHALL be written to the server-side log via `console.error` only. For HTTP-status failures the message SHALL end with the full-width-parenthesised status code in the form `(HTTP <status>)`. The messages SHALL be:

| Failure type | Message |
| ------------ | ------- |
| Transient status (500, 502, 503, 504) after retries are exhausted | `Gemini 服務目前較為繁忙,請稍後再試。(HTTP <status>)` |
| 429 | `Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP 429)` |
| 401 or 403 | `Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP <status>)` |
| Any other non-OK status | `Gemini 回應錯誤,請稍後再試。(HTTP <status>)` |
| Network exception from fetch | `無法連線至 Gemini,請檢查網路連線後再試一次。` |
| HTTP 200 with no text content | `Gemini 回應中沒有內容。` |

#### Scenario: Raw error body is not exposed to the user

- **WHEN** the Gemini API responds with HTTP 503 and body `{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}` on every attempt
- **THEN** the returned `message` SHALL NOT contain the substrings `overloaded`, `UNAVAILABLE`, or `{`, and `console.error` SHALL have been called with the raw body included in its arguments

#### Scenario: Network exception message

- **WHEN** the underlying fetch rejects with an error
- **THEN** `callGemini` SHALL return `{ ok: false, message: "無法連線至 Gemini,請檢查網路連線後再試一次。" }` after exactly 1 HTTP attempt and with no retry delay applied

##### Example: message by status

| Status | Expected message |
| ------ | ---------------- |
| 503 (all 5 attempts) | `Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)` |
| 429 | `Gemini 的使用額度或請求頻率已達上限,請稍後再試。(HTTP 429)` |
| 403 | `Gemini API 金鑰無效或沒有權限,請檢查伺服器設定。(HTTP 403)` |
| 400 | `Gemini 回應錯誤,請稍後再試。(HTTP 400)` |

---
### Requirement: Route Duration Allowance

The API routes that call `callGemini` (`/api/translate` and `/api/reflect`) SHALL export a `maxDuration` of 60 seconds, so that the worst-case retry wait of under 17 seconds plus up to 5 request round trips is not cut off by the hosting platform's default function timeout.

#### Scenario: Both routes declare maxDuration

- **WHEN** the route modules `app/api/translate/route.ts` and `app/api/reflect/route.ts` are imported
- **THEN** each SHALL export a constant `maxDuration` equal to `60`
