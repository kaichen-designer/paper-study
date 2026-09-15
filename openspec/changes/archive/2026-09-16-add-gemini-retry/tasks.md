## 1. Gemini Client 重試邏輯

- [x] 1.1 在 `lib/gemini/client.ts` 的 `callGemini` 內加入重試判斷邏輯,實現 Requirement: Transient Error Retry 與 Requirement: Non-Retryable Error Fast Path——依設計決策「可重試狀態碼判斷」只對 429/500/502/503/504 觸發重試,其餘狀態碼立即回傳、不觸發任何等待;重試間隔依設計決策「指數退避與抖動公式」計算(base 500ms、jitter 200ms、最多重試 2 次,即最多 3 次 HTTP 呼叫)。驗證方式:`npx vitest run lib/gemini/client.test.ts` 中「第一次 503、第二次成功」與「連續 401 立即失敗且僅呼叫 1 次」兩個測試案例通過。

- [x] 1.2 依設計決策「等待方式可注入以利測試」,把 1.1 新增的重試等待邏輯抽成可覆寫的內部 sleep 依賴(預設為真正以 `setTimeout` 等待,測試時可替換為立即 resolve 的假實作)。驗證方式:`lib/gemini/client.test.ts` 中涉及重試的測試案例在不使用 `vi.useFakeTimers`、不真的等待數秒的情況下於毫秒等級執行完畢,且仍能正確斷言底層 fetch 的呼叫次數。

- [x] 1.3 確保重試用盡後的錯誤訊息維持設計決策「錯誤訊息格式不變」所述的既有格式,滿足 Requirement: Backward-Compatible Contract——`callGemini` 的公開函式簽章 `callGemini({ prompt, apiKey, model? })` 與 `GeminiResult` 回傳型別維持不變。驗證方式:`lib/translation/gemini.test.ts` 以及 `lib/gemini/client.test.ts` 中本次變更之前就存在的既有測試案例,不修改測試內容即可全數維持通過。

## 2. 測試補齊與整體驗證

- [x] 2.1 在 `lib/gemini/client.test.ts` 新增三個涵蓋 Requirement: Transient Error Retry 與 Requirement: Non-Retryable Error Fast Path 的測試案例:(a) 第一次回傳 503、第二次回傳 200 時最終回傳 `{ ok: true, text }` 且底層 fetch 被呼叫恰好 2 次;(b) 連續 3 次回傳 503 時最終回傳既有格式的 `{ ok: false, message }` 且 fetch 被呼叫恰好 3 次;(c) 回傳 401 時 fetch 只被呼叫 1 次、不觸發任何等待。驗證方式:`npx vitest run lib/gemini/client.test.ts` 全數通過。

- [x] 2.2 執行完整測試套件與型別檢查,確認本次變更未影響翻譯與論文心得對話既有功能(呼叫端無需修改即可繼續運作)。驗證方式:`npx vitest run` 全數通過,且專案既有的型別檢查指令(如 `npx tsc --noEmit`)無錯誤。
