## Context

`lib/gemini/client.ts` 的 `callGemini` 是共用的低階 Gemini API 呼叫函式,同時被 `lib/translation/gemini.ts`(翻譯功能)與 `lib/reflection/generate-reply.ts`(論文心得對話功能)呼叫。目前它只送出一次 HTTP 請求,任何非 2xx 回應都直接轉成 `{ ok: false, message }` 往上丟。Google Gemini API 在高流量時會回傳 503(`UNAVAILABLE`)等暫時性錯誤,官方訊息本身建議稍後重試,但目前系統沒有任何自動重試,使用者體驗上是「隨機看到原始英文/JSON 錯誤訊息」。

## Goals / Non-Goals

**Goals:**

- 對暫時性錯誤狀態碼自動重試,並以指數退避 + 抖動控制重試間隔。
- 保持 `callGemini` 對外簽章、回傳型別(`GeminiResult`)與錯誤訊息格式完全不變,呼叫端不需修改。
- 重試邏輯可在單元測試中以極短或為零的等待時間驗證,不拖慢測試套件。

**Non-Goals:**

- 不做使用者可見的重試進度提示。
- 不引入外部重試/HTTP 函式庫。
- 不改變非暫時性錯誤(4xx,如 400/401/403)的行為,這類錯誤仍是立即失敗。

## Decisions

### 可重試狀態碼判斷

只對 429、500、502、503、504 這五種狀態碼重試,其餘一律視為不可重試立即回傳。理由:429 代表限流、5xx 代表伺服器端暫時性問題,重試後有機會成功;400/401/403 等屬於請求本身或金鑰有問題,重試不會改變結果,只會浪費時間並讓使用者等更久。

### 指數退避與抖動公式

第 n 次重試(n 從 1 開始)等待時間為 `base * 2^(n-1) + random(0, jitter)`,其中 `base` 預設 500ms、`jitter` 預設 200ms、最多重試 2 次(即最多呼叫 API 3 次)。加入隨機抖動是為了避免多個並發請求同時重試造成二次流量尖峰。這三個數字(base、jitter、maxRetries)作為 `callGemini` 內部函式的可選參數,對外的公開簽章維持不變(呼叫端不需要也不會傳入這些值),預設值即為上述數字。

### 等待方式可注入以利測試

重試等待邏輯抽成一個內部的 `sleep` 依賴(預設是真正的 `setTimeout` 包裝的 Promise),`callGemini` 內部可覆寫成立即 resolve 的假實作。單元測試藉由覆寫這個內部依賴,讓「重試 2 次後成功」「重試用盡後失敗」等測試案例不需要真的等待 500ms/1000ms,可在毫秒等級跑完,同時仍能斷言重試次數與間隔計算邏輯正確。

### 錯誤訊息格式不變

重試全部失敗後,回傳的 `message` 使用最後一次失敗回應的狀態碼與內容組成,格式與現行 `Gemini 回應錯誤(HTTP ${status})${detail}` 完全相同,確保 `lib/reflection/generate-reply.ts`、`app/api/reflect/route.ts` 等既有呼叫端與其既有測試不需要任何修改。

## Implementation Contract

**Behavior**:
- 呼叫 `callGemini` 時,若 Gemini API 回傳 429/500/502/503/504,函式會在內部自動重試最多 2 次(共最多 3 次 HTTP 呼叫),重試間隔遵循上述指數退避 + 抖動公式。
- 若任一次重試成功(HTTP 2xx 且回應內容非空),`callGemini` 回傳 `{ ok: true, text }`,呼叫端完全不會感知中間發生過失敗。
- 若重試用盡仍失敗,或遇到不可重試狀態碼(如 400/401/403),回傳 `{ ok: false, message }`,`message` 格式與現行一致。
- 網路層例外(fetch 拋出 exception,例如斷線)不重試,維持現行行為直接回傳 `無法連線至 Gemini:${err.message}`(範圍內不新增對網路例外的重試,避免與既有測試預期衝突,超出本次變更範圍)。

**Interface / data shape**:
- `callGemini({ prompt, apiKey, model? }): Promise<GeminiResult>` 對外簽章不變。
- `GeminiResult` 型別(`{ ok: true; text: string } | { ok: false; message: string }`)不變。

**Failure modes**:
- 可重試狀態碼、重試用盡 → `{ ok: false, message: "Gemini 回應錯誤(HTTP ${status})${detail}" }`(與現行格式相同)。
- 不可重試狀態碼 → 立即回傳同上格式,但不經過重試延遲。
- 回應成功但無內容 → 沿用現行 `{ ok: false, message: "Gemini 回應中沒有內容。" }`,不觸發重試(此為內容問題而非傳輸暫時性問題)。

**Acceptance criteria**:
- `npx vitest run lib/gemini/client.test.ts` 全數通過。
- 新增測試案例涵蓋:(1) 第一次回應 503、第二次回應 200 時,最終回傳 `{ ok: true, text }` 且底層 fetch 被呼叫 2 次;(2) 連續 3 次都回傳 503 時,最終回傳既有格式的 `{ ok: false, message }` 且 fetch 恰被呼叫 3 次;(3) 回傳 401 時,fetch 只被呼叫 1 次,立即回傳錯誤,不觸發任何等待。
- 既有呼叫端測試(`lib/translation/gemini.test.ts`、`lib/reflection/generate-reply.ts` 相關測試)不需修改即可繼續通過。

**Scope boundaries**:
- 範圍內:`lib/gemini/client.ts` 內部的重試/退避邏輯與其單元測試。
- 範圍外:`lib/translation/gemini.ts`、`lib/reflection/generate-reply.ts`、`app/api/reflect/route.ts`、任何前端元件(`components/ReflectionChat.tsx` 等)的修改;新增使用者可見的重試狀態 UI;對網路層 exception(非 HTTP 錯誤回應)的重試。

## Risks / Trade-offs

- [重試會讓單次失敗的總等待時間拉長(最多 base*(2^0+2^1) + 2*jitter ≈ 1.9 秒)] → 使用相對保守的 `base`(500ms)與 `maxRetries`(2 次),避免使用者等待過久;上限可視未來實際觀測到的 503 頻率再調整。
- [對 429 重試若後端限流是長時間性的(非瞬間尖峰),重試可能仍全部失敗] → 屬預期行為,最終仍會回傳與現行相同的錯誤訊息,不影響現有錯誤處理路徑。
