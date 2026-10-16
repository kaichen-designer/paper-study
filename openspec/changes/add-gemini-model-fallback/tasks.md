## 1. 先寫失敗的測試(TDD)

- [x] 1.1 在 lib/gemini/client.test.ts 為 Model Fallback After Exhausted Transient Retries 補測試,對應設計決策「備援放在共用 client 的新函式 callGeminiWithFallback」與「只有重試用盡的暫時性 5xx 才觸發備援」:主模型網址(含 gemini-3.1-flash-lite)回 503 共 5 次、備援網址(含 gemini-3.6-flash)回 200 時,fetch 恰好 6 次、注入的 sleep 恰好 4 次且全在備援呼叫之前、回傳 ok 為 true;主模型第 2 次就成功時不呼叫備援;主模型失敗為 500、502、504 用盡時同樣備援;主模型失敗為 429、401、403、400、fetch 例外、200 空回應時 fetch 恰好 1 次、不呼叫備援且結果等於 `callGemini` 的結果;另加一則 `callGemini` 在 503 用盡時只打 5 次、失敗物件只有 ok 與 message 兩個欄位。驗證:執行 npx vitest run lib/gemini/client.test.ts,新測試在實作前為紅燈(callGeminiWithFallback 尚未匯出),既有測試維持綠燈
- [x] 1.2 在 lib/gemini/client.test.ts 補「備援也失敗時回傳主模型的失敗訊息」的測試:主模型 503 用盡後備援回 429、回 503、fetch 例外、200 空回應時,結果的 message 等於 `Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)`,備援只被呼叫 1 次(fetch 共 6 次),且訊息不含備援的錯誤文字。驗證:npx vitest run lib/gemini/client.test.ts,新測試在實作前為紅燈
- [x] 1.3 在 lib/gemini/client.test.ts 為 Fallback Time Budget 補測試,對應設計決策「備援只做一次嘗試並受總時間預算限制」:以注入的 now 模擬主模型用盡時已耗時 20000、25000、42000、47000 毫秒,斷言備援請求的 options.signal 存在且逾時分別為 30000、30000、13000、8000(可用 vi.spyOn(AbortSignal, "timeout") 取得毫秒數);耗時 47001 與 60000 毫秒時不送出備援請求且回傳主模型的友善訊息;主模型的 5 次請求 options.signal 皆為 undefined;備援請求因逾時而 fetch 拒絕時不丟出例外並回傳主模型訊息。驗證:npx vitest run lib/gemini/client.test.ts,新測試在實作前為紅燈
- [x] 1.4 在 lib/gemini/client.test.ts 為 Fallback Decision Logging 補測試,對應設計決策「備援決策寫入伺服器日誌」:以 vi.spyOn(console, "warn") 與 vi.spyOn(console, "error") 斷言,備援觸發時 warn 的一行同時含 `[callGemini]`、`falling back`、gemini-3.1-flash-lite、gemini-3.6-flash、`HTTP 503`;備援成功時另有一行 warn 含 `succeeded` 與 gemini-3.6-flash;備援回 429 時 error 有一行含 gemini-3.6-flash 與 `HTTP 429`;預算不足略過時 warn 含 `skipping fallback`;主模型成功或回 429 時沒有任何含 `falling back` 的日誌;所有日誌不含 apiKey 與 prompt 文字。驗證:npx vitest run lib/gemini/client.test.ts,新測試在實作前為紅燈
- [x] 1.5 [P] 在 lib/translation/gemini.test.ts 為 Translation Model Fallback 補測試:fetch mock 對含 gemini-3.1-flash-lite 的網址回 503、對含 gemini-3.6-flash 的網址回 200 與譯文時,`translateWithGemini` 在 vi.useFakeTimers 並以 vi.advanceTimersByTimeAsync 推進退避等待後 fetch 共 6 次(前 5 次主模型、第 6 次備援)、結果為成功譯文、備援請求的 prompt 與主模型請求的 prompt 完全相同;兩個模型都失敗時結果為 `Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)`;主模型直接成功時 fetch 只有 1 次且網址不含 gemini-3.6-flash;既有「使用 gemini-3.1-flash-lite」測試維持不變。驗證:npx vitest run lib/translation/gemini.test.ts,新測試在實作前為紅燈(`translateWithGemini` 簽章不變、沒有 sleep 注入點,因此一律使用假計時器避免真的等待約 15 秒)

## 2. 實作 callGeminiWithFallback

- [x] 2.1 在 lib/gemini/client.ts 把現有重試迴圈抽成內部(不匯出)的單一模型函式,該函式接收模型、最大重試次數與可選的逾時毫秒數,失敗時額外回傳內部旗標(是否為重試用盡的暫時性 5xx)與最後狀態碼;`callGemini` 改為呼叫它並重建只含 ok 與 text 或 ok 與 message 的結果,簽章與 `GeminiResult` 型別不變;「giving up」日誌改為帶入模型名稱;`retryDeps` 擴充可選的 now(預設 Date.now)。這是設計決策「備援放在共用 client 的新函式 callGeminiWithFallback」的重構部分,行為對既有呼叫端零變化。驗證:npx vitest run lib/gemini/client.test.ts 中既有的 callGemini 測試不修改即全數通過,且 1.1 中「callGemini 失敗物件只有 ok 與 message」的測試轉綠
- [x] 2.2 在 lib/gemini/client.ts 新增並匯出 `callGeminiWithFallback`,實作 Model Fallback After Exhausted Transient Retries 與設計決策「只有重試用盡的暫時性 5xx 才觸發備援」:先以主模型走完整重試,僅當內部旗標顯示為重試用盡的 500/502/503/504 時才以備援模型做 1 次嘗試(不重試、不 sleep),其餘失敗型別直接回傳主模型結果;依設計決策「備援也失敗時回傳主模型的失敗訊息」,備援失敗(含 429、逾時、例外、空回應)時回傳主模型的結果。驗證:任務 1.1 與 1.2 的測試全數通過
- [x] 2.3 在 lib/gemini/client.ts 實作 Fallback Time Budget:新增常數 OVERALL_BUDGET_MS 為 55000、FALLBACK_MAX_TIMEOUT_MS 為 30000、FALLBACK_MIN_TIMEOUT_MS 為 8000,備援前計算逾時為 30000 與剩餘預算的較小值,小於 8000 則略過備援,否則備援請求帶 `AbortSignal.timeout(逾時毫秒數)`,主模型請求不帶 signal。驗證:任務 1.3 的測試全數通過
- [x] 2.4 在 lib/gemini/client.ts 實作 Fallback Decision Logging,即設計決策「備援決策寫入伺服器日誌」:觸發備援時 console.warn 一行含主模型名、主模型最後狀態碼、備援模型名與 `falling back`;備援成功時 console.warn 一行含 `succeeded`;備援失敗時 console.error 一行含備援模型名與失敗原因;略過時 console.warn 含 `skipping fallback` 與剩餘預算;所有行以 `[callGemini]` 開頭且不含 apiKey 與 prompt。驗證:任務 1.4 的測試全數通過

## 3. 翻譯改用備援

- [x] 3.1 在 lib/translation/gemini.ts 讓 `translateWithGemini` 改呼叫 `callGeminiWithFallback`,主模型為既有的 FAST_MODEL(gemini-3.1-flash-lite)、備援模型為新常數 gemini-3.6-flash,並更新檔案內註解說明備援的原因與條件;簽章、回傳型別與 prompt 不變,實現 Translation Model Fallback。反思對話不使用備援:lib/reflection/generate-reply.ts 維持原樣不修改。驗證:任務 1.5 的測試全數通過,且 npx vitest run lib/translation lib/reflection 全數通過

## 4. 整體驗證

- [x] 4.1 執行完整測試與型別檢查,確認沒有迴歸,並確認 `maxDuration` 沒有被改動。驗證:npx vitest run 全數通過、npx tsc --noEmit 無錯誤、git diff 顯示 app/api/translate/route.ts 與 lib/reflection 下的檔案沒有變動
- [ ] 4.2 在 Vercel Preview 或本機實測備援的實際延遲與額度行為:先用 curl 量一次 gemini-3.6-flash 回一句翻譯的耗時,決定 30000 毫秒的備援逾時是否合理(對應設計 Open Questions 的延遲問題);再暫時讓主模型網址指向一個必回 503 的假端點或以環境測試方式模擬,確認伺服器日誌出現 `falling back` 與備援結果。驗證:記錄 gemini-3.6-flash 的實測耗時,並貼上日誌中的 `falling back` 與 `succeeded` 或失敗行;若實測耗時持續大於 30 秒,在變更說明中記錄並回報是否調整 FALLBACK_MAX_TIMEOUT_MS
