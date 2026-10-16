## ADDED Requirements

### Requirement: Translation Model Fallback

Selection translation through Gemini SHALL use `gemini-3.1-flash-lite` as the primary model and `gemini-3.6-flash` as the fallback model, by calling the shared client's `callGeminiWithFallback`. The fallback model SHALL be used only under the conditions defined by the gemini-retry capability (the primary model's transient 5xx retries exhausted). `translateWithGemini` SHALL keep its existing input and result shape, and the translation cache SHALL continue to be keyed only by source text hash and target language, so a translation produced by the fallback model is cached and reused exactly like one produced by the primary model. Reflection chat SHALL NOT use the fallback model as part of this requirement.

#### Scenario: Translation succeeds on the fallback model

- **WHEN** a user triggers a translation, `gemini-3.1-flash-lite` responds with HTTP 503 on all 5 attempts, and `gemini-3.6-flash` responds with a valid translation
- **THEN** the system SHALL return the fallback model's translated text as a successful translation, the frontend SHALL display it without a failure message, and the result SHALL be saved to the translation cache

##### Example: request sequence

- **GIVEN** the fetch mock returns HTTP 503 for URLs containing `gemini-3.1-flash-lite` and a valid candidate with text `你好世界` for URLs containing `gemini-3.6-flash`
- **WHEN** `translateWithGemini({ text: "hello world", targetLang: "ZH", apiKey })` is invoked with fake timers advanced through the backoff waits
- **THEN** the fetch SHALL have been called 6 times, the first 5 URLs SHALL contain `gemini-3.1-flash-lite`, the 6th URL SHALL contain `gemini-3.6-flash`, and the result SHALL be `{ ok: true, text: "你好世界" }`

#### Scenario: Translation prompt is unchanged on the fallback request

- **WHEN** the fallback request is sent
- **THEN** its prompt text SHALL equal the prompt sent to the primary model (the same Traditional Chinese or other target-language translation instruction followed by the selected text)

#### Scenario: Both models fail

- **WHEN** `gemini-3.1-flash-lite` exhausts transient retries with HTTP 503 and `gemini-3.6-flash` also fails
- **THEN** the system SHALL return an error response with the message `Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)` and the frontend SHALL display it as a visible failure message, consistent with the Translation Failure Handling requirement

#### Scenario: Primary model succeeds without using the fallback

- **WHEN** `gemini-3.1-flash-lite` returns a valid translation
- **THEN** no request SHALL be sent to `gemini-3.6-flash`, so the fallback model's daily quota is not consumed
