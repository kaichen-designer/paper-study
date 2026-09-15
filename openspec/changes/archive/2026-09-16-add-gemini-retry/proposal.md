## Problem

呼叫 Gemini API(`lib/gemini/client.ts` 的 `callGemini`)時,若 Google 端因需求量過高回傳暫時性錯誤(如 HTTP 503 `UNAVAILABLE`),目前沒有任何重試機制,系統會把原始錯誤直接丟回給使用者(影響翻譯功能與論文心得對話功能),使用者只能自行手動重新操作。

## Root Cause

`callGemini` 只送出一次 HTTP 請求,`response.ok` 為 false 時立即回傳 `{ ok: false, message }` 給呼叫端,完全沒有針對暫時性(transient)錯誤狀態碼做重試或退避等待,即使 Google 官方錯誤訊息本身已說明「Spikes in demand are usually temporary」。

## Proposed Solution

在 `callGemini` 內部加上重試邏輯:

- 針對可重試的暫時性錯誤狀態碼(429、500、502、503、504)進行重試;其餘 4xx(例如 400、401、403)視為不可重試,立即回傳錯誤,不做任何等待。
- 採用指數退避(exponential backoff):第一次重試前等待固定基準時間,之後每次重試等待時間倍增,並加入隨機抖動(jitter),避免多個請求同時重試造成二次尖峰。
- 最多重試固定次數(預設 2 次,總共最多呼叫 3 次 API),超過重試次數仍失敗則回傳目前既有的錯誤格式 `{ ok: false, message }`,格式與行為對現有呼叫端(`lib/translation/gemini.ts`、`lib/reflection/generate-reply.ts`)保持相容,不需修改呼叫端程式碼。
- 重試次數與基準等待時間透過內部參數注入(可覆寫、有預設值),以利單元測試以極短等待時間驗證重試邏輯,不需要在測試中真的等待數秒。

## Non-Goals (optional)

- 不新增使用者可見的「重試中」狀態或 UI 提示,重試對使用者而言是透明的,體感上只是這次呼叫等待時間變長。
- 不引入外部重試函式庫,沿用現有專案風格(純函式、無額外依賴)實作。
- 不變更 `callGemini` 對外的函式簽章或回傳型別(`GeminiResult`),維持向後相容。

## Capabilities

### New Capabilities

- `gemini-retry`: 共用的 Gemini API 呼叫端(`callGemini`)對暫時性錯誤(429/500/502/503/504)自動以指數退避重試,對不可重試的錯誤立即回傳,此行為由翻譯與論文心得對話等所有呼叫端共用。

### Modified Capabilities

(none)

## Success Criteria

- 當 Gemini API 針對某次請求回傳可重試錯誤(如 503)後,若重試次數內的後續請求成功,`callGemini` 最終回傳 `{ ok: true, text }`,呼叫端(翻譯、心得對話)不會看到中間的失敗。
- 當所有重試都失敗時,`callGemini` 回傳的錯誤訊息格式與現行格式一致(`Gemini 回應錯誤(HTTP ${status})...`),既有呼叫端與測試不需修改就能繼續運作。
- 對 400/401/403 等不可重試的錯誤,`callGemini` 不進行任何重試,立即回傳錯誤,避免例如金鑰錯誤時被無謂地重試拖慢回應。
- `npx vitest run lib/gemini/client.test.ts` 全數通過,且新增測試涵蓋三種情境:可重試錯誤重試後成功、可重試錯誤重試用盡後失敗、不可重試錯誤立即失敗不重試。

## Impact

- Affected specs: gemini-retry (new)
- Affected code:
  - Modified: lib/gemini/client.ts
  - Modified: lib/gemini/client.test.ts
