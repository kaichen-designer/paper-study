## Why

Gemini 回應 503(服務過載)時,`callGemini` 目前最多重試 2 次、累計只等約 1.5 秒,撐不過 Google 常見的數十秒過載時段,使用者仍會直接看到失敗。實測同一把金鑰在當下已恢復(HTTP 200),但 gemini-3.1-flash-lite 回覆一個單字就花了約 15 秒,證實當時服務忙碌且屬暫時性。此外,失敗時顯示給使用者的是原始的 `Gemini 回應錯誤(HTTP 503):{...JSON...}`,對一般使用者不友善。

## What Changes

- 把暫時性錯誤(HTTP 500/502/503/504)的重試次數從 2 次提高到 4 次(共 5 次嘗試),指數退避的基準延遲從 500 毫秒提高到 1000 毫秒,四次等待約為 1、2、4、8 秒,累計約 15 秒(加上每次最多 500 毫秒的隨機抖動,上限約 17 秒)。
- 把 `callGemini` 回傳的失敗訊息改為友善的繁體中文提示,依錯誤類型區分:服務繁忙(重試用盡的 5xx)、額度或頻率上限(429)、金鑰無效或無權限(401/403)、其他 HTTP 錯誤、網路無法連線。訊息保留簡短的 HTTP 狀態碼方便回報,但不再包含 Gemini 回傳的原始錯誤本文。
- 原始錯誤本文改為只寫入伺服器端 `console.error`,不再出現在回應給使用者的訊息中。
- 429 仍然不重試(維持既有決策:免費層每日配額用盡時重試只會浪費額度)。
- 在 `/api/translate` 與 `/api/reflect` 兩個 route 匯出 `maxDuration`,避免 15 秒以上的重試等待被 serverless 函式的預設逾時中斷。

## Non-Goals

- 不加入模型備援(失敗後改打另一個 Gemini 模型);此做法已評估,但會消耗另一個模型的每日配額,留待另案處理。
- 不處理 429 的重試或依 `quotaId` 區分每分鐘與每日配額。
- 不修改前端元件(`components/TranslationPanel.tsx`、`components/ReflectionChat.tsx`)的呈現方式;它們已直接顯示 API 回傳的 `error` 字串,訊息變友善後自然生效。
- 不更動 `callGemini` 的公開簽章與 `GeminiResult` 型別。
- 不新增逾時中止(AbortController)或 Retry-After 標頭解析。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gemini-retry`: 暫時性錯誤的重試上限由 2 次改為 4 次(共 5 次嘗試)、退避基準改為 1 秒;失敗訊息改為友善中文提示且不含原始錯誤本文。

## Impact

- Affected specs: `gemini-retry`(修改 Transient Error Retry 與 Non-Retryable Error Fast Path 兩個需求,新增 Friendly Error Messages 需求)
- Affected code:
  - Modified: lib/gemini/client.ts
  - Modified: lib/gemini/client.test.ts
  - Modified: app/api/translate/route.ts
  - Modified: app/api/reflect/route.ts
  - Modified: openspec/specs/gemini-retry/spec.md(由 archive 流程套用 delta)
  - New: (none)
  - Removed: (none)
