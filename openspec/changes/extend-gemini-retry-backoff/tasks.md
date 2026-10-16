## 1. 先寫失敗的測試(TDD)

- [x] 1.1 在 lib/gemini/client.test.ts 為 Transient Error Retry 補測試:503 連續失敗時 fetch 恰好被呼叫 5 次、注入的 sleep 恰好被呼叫 4 次且基準延遲依序為 1000、2000、4000、8000(各加上小於 500 的抖動);第 5 次才成功時回傳 `{ ok: true }`。驗證:執行 `npx vitest run lib/gemini/client.test.ts`,這些新測試在實作前為紅燈,並把既有「重試 2 次」的斷言更新為新次數
- [x] 1.2 在 lib/gemini/client.test.ts 為 Friendly Error Messages 補測試:依狀態碼 503、429、403、400 與網路例外、200 無內容,逐一斷言回傳訊息等於 spec 表格中的完整字串;另斷言原始回應本文(例如 `overloaded`、`UNAVAILABLE`、`{`)不出現在 `message`,且 `console.error` 的參數包含原始本文。驗證:`npx vitest run lib/gemini/client.test.ts` 在實作前為紅燈
- [x] 1.3 在 lib/gemini/client.test.ts 為 Non-Retryable Error Fast Path 更新既有的 401 與 429 測試:fetch 只被呼叫 1 次、sleep 未被呼叫,且訊息等於新的友善字串(含 `(HTTP 401)`、`(HTTP 429)`)。驗證:`npx vitest run lib/gemini/client.test.ts`

## 2. 實作 callGemini 的退避與友善訊息

- [x] 2.1 在 lib/gemini/client.ts 把 `MAX_RETRIES` 改為 4、`BASE_DELAY_MS` 改為 1000、`JITTER_MS` 改為 500,使暫時性錯誤最多嘗試 5 次、累計等待 15 秒以上且小於 17 秒;同步更新檔案內關於「最多 2 次重試」的註解。驗證:任務 1.1 的測試全數通過
- [x] 2.2 在 lib/gemini/client.ts 新增依失敗類型產生友善中文訊息的邏輯(503 等暫時性錯誤、429、401/403、其他狀態碼、網路例外),訊息只含簡短 `(HTTP <status>)`,原始回應本文改由 `console.error` 輸出,不再放進回傳的 `message`;429 仍不重試、網路例外仍立即失敗,`callGemini` 的簽章與 `GeminiResult` 型別不變(Backward-Compatible Contract)。驗證:任務 1.2 與 1.3 的測試全數通過,且 `npx vitest run lib/translation lib/reflection` 的既有測試不受影響

## 3. 路由逾時額度

- [x] 3.1 [P] 在 app/api/translate/route.ts 匯出 `export const maxDuration = 60`,使 Route Duration Allowance 成立,翻譯請求在重試等待期間不會被平台預設逾時中斷。驗證:`grep -n "maxDuration" app/api/translate/route.ts` 顯示值為 60,且 `npx tsc --noEmit` 通過
- [x] 3.2 [P] 在 app/api/reflect/route.ts 匯出 `export const maxDuration = 60`,使心得對話請求在重試等待期間不會被平台預設逾時中斷。驗證:`grep -n "maxDuration" app/api/reflect/route.ts` 顯示值為 60,且 `npx tsc --noEmit` 通過

## 4. 整體驗證

- [x] 4.1 執行完整測試與型別檢查,確認沒有迴歸。驗證:`npx vitest run` 全數通過、`npx tsc --noEmit` 無錯誤
- [ ] 4.2 手動確認前端顯示:暫時把 fetch 對 Gemini 的回應模擬為 503,在 TranslationPanel 與 ReflectionChat 觸發一次請求,畫面顯示「Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)」而不是原始 JSON。驗證:截圖或文字紀錄兩個畫面的錯誤文字
