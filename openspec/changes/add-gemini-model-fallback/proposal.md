## Why

使用者在平板的 Vercel Preview 實測,「翻譯選取範圍」特別容易遇到 503,畫面顯示「Gemini 服務目前較為繁忙」。翻譯固定使用 gemini-3.1-flash-lite(FAST_MODEL),已提交的 extend-gemini-retry-backoff 變更把同一模型的 503 重試拉長到 4 次、累計約 15–17 秒,但若該模型的過載時段更長,重試用完仍會失敗。Gemini 的過載通常是單一模型的容量問題,另一個模型(gemini-3.6-flash)往往仍可用,因此在主模型重試用盡後改打備援模型,可以讓使用者較少看到失敗訊息。

## What Changes

- 在 `lib/gemini/client.ts` 新增匯出函式 `callGeminiWithFallback`:先以主模型呼叫(沿用既有的 4 次重試與退避),只有在主模型因暫時性 5xx(500/502/503/504)重試用盡而失敗時,才改用備援模型再試一次。`callGemini` 的簽章與 `GeminiResult` 型別完全不變。
- 備援只做 1 次嘗試(不重試、不等待),並受總時間預算限制:從呼叫開始算起,備援請求的逾時為「剩餘預算扣除安全邊際」且不超過上限;剩餘時間不足時直接略過備援。如此 `/api/translate` 既有的 `maxDuration = 60` 仍然足夠,不需調整。
- 429、401/403、其他 4xx、網路例外與 HTTP 200 空回應都不觸發備援,維持原本的立即失敗。
- 備援也失敗時,回傳主模型的友善失敗訊息(例如「Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)」),不洩漏備援模型的錯誤細節。
- 伺服器日誌明確記錄「主模型失敗、改用備援」以及備援的結果(成功或失敗與狀態碼),兩者都包含模型名稱,方便在 Vercel 日誌中判斷。
- `lib/translation/gemini.ts` 的 `translateWithGemini` 改為呼叫 `callGeminiWithFallback`,主模型維持 gemini-3.1-flash-lite,備援為 gemini-3.6-flash。

## Non-Goals

- 不替反思對話(`lib/reflection/generate-reply.ts`)加備援。反思目前暫時借用 gemini-3.1-flash-lite(REFLECTION_MODEL),且 prompt 含論文全文,備援到較慢的 gemini-3.6-flash 容易超過路由時限;同時備援會消耗與日後還原後的反思主模型相同的每日配額。取捨細節見 design.md。`callGeminiWithFallback` 刻意設計成通用函式,日後可另案接入反思。
- 不改變 `callGemini` 的公開簽章、`GeminiResult` 型別與既有重試次數、退避時間。
- 不針對 429 做備援或依 `quotaId` 區分每分鐘與每日配額。
- 不新增每日備援次數上限、跨請求的熔斷器或持久化計數(serverless 環境下記憶體計數不可靠,持久化需另案)。
- 不修改 `app/api/translate/route.ts` 的 `maxDuration`(維持 60),也不修改任何前端元件。
- 不在回應或快取中記錄「這份翻譯由哪個模型產生」;翻譯快取仍只以原文雜湊與目標語言為鍵。
- 不調整 gemini-3.6-flash 的 thinking 設定或請求內容。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gemini-retry`: 新增 Model Fallback After Exhausted Transient Retries 需求,規範備援的觸發條件、單次嘗試、時間預算、失敗時回傳主模型訊息與日誌內容。
- `translation`: 新增 Translation Model Fallback 需求,規範選取範圍翻譯使用 gemini-3.1-flash-lite 為主、gemini-3.6-flash 為備援。

## Impact

- Affected specs: `gemini-retry`(新增需求,與 extend-gemini-retry-backoff 修改的需求不重疊)、`translation`(新增需求)
- Affected code:
  - Modified: lib/gemini/client.ts
  - Modified: lib/gemini/client.test.ts
  - Modified: lib/translation/gemini.ts
  - Modified: lib/translation/gemini.test.ts
  - Modified: openspec/specs/gemini-retry/spec.md(由 archive 流程套用 delta)
  - Modified: openspec/specs/translation/spec.md(由 archive 流程套用 delta)
  - New: (none)
  - Removed: (none)
- 相依順序:本變更以 extend-gemini-retry-backoff 的程式碼為基礎(該變更程式碼已提交),建議先 archive extend-gemini-retry-backoff 再 archive 本變更。
