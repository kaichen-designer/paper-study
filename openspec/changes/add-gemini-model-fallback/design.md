## Context

- 翻譯(`lib/translation/gemini.ts` 的 `translateWithGemini`)固定呼叫 gemini-3.1-flash-lite(`FAST_MODEL`)。已提交的 extend-gemini-retry-backoff 讓 `callGemini` 在 500/502/503/504 時最多重試 4 次(共 5 次嘗試),等待 1、2、4、8 秒,累計 15 秒以上、未滿 17 秒,耗盡後回傳友善訊息「Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)」。
- 使用者在平板的 Vercel Preview 實測,翻譯選取範圍特別容易遇到 503;實測 gemini-3.1-flash-lite 回一個字曾花約 15 秒,代表該模型有較長的過載時段,而 gemini-3.6-flash 當時較不擁塞。Gemini 的 503 通常是單一模型的容量問題,因此換模型是比單純拉長等待更有效的手段。
- `callGemini` 的公開簽章與 `GeminiResult`(成功為 ok: true 加 text,失敗為 ok: false 加 message)受 gemini-retry spec 的 Backward-Compatible Contract 約束;失敗只剩一段友善中文訊息,呼叫端無法分辨是 503 用盡、429、401 還是網路例外。
- 配額:gemini-3.6-flash 免費層每日約 20 次(見 lib/gemini/client.ts 的 `RETRYABLE_STATUS_CODES` 註解);lib/reflection/generate-reply.ts 的 `REFLECTION_MODEL` 目前「暫時」借用 gemini-3.1-flash-lite,正是因為 gemini-3.6-flash 的每日額度曾被用完,待額度重置或升級計費後預計還原為 gemini-3.6-flash。
- 時間:app/api/translate/route.ts 已匯出 `maxDuration = 60`。程式註解記載 gemini-3.6-flash 回一句話曾實測 25–38 秒(內部 thinking),這個數字會直接決定備援能不能塞進 60 秒。

## Goals / Non-Goals

**Goals:**

- 翻譯在 gemini-3.1-flash-lite 因暫時性 5xx 重試用盡後,自動改用 gemini-3.6-flash 再試一次,降低使用者看到「服務目前較為繁忙」的機率。
- `callGemini` 的簽章與 `GeminiResult` 型別零變更,既有呼叫端(反思對話)行為不變。
- 只有「重試用盡的暫時性 5xx」會觸發備援;其他失敗維持立即失敗。
- 備援加上去之後,整個翻譯請求的最壞耗時仍落在 `maxDuration = 60` 內。
- 伺服器日誌能清楚看出「主模型失敗 → 改用備援 → 備援結果」。

**Non-Goals:**

- 不替反思對話加備援(理由見「反思對話不使用備援」決策)。
- 不處理 429 備援、不依 `quotaId` 區分配額類型、不加每日備援次數上限或熔斷器、不做持久化計數。
- 不改 `maxDuration`、不改前端元件、不改翻譯快取鍵、不記錄由哪個模型產生翻譯。
- 不調整 gemini-3.6-flash 的 thinking 設定或請求本文。

## Decisions

### 備援放在共用 client 的新函式 callGeminiWithFallback

比較三個位置:

| 方案 | 做法 | 優點 | 缺點 |
| ---- | ---- | ---- | ---- |
| A. 在 `translateWithGemini` 內判斷 | 先呼叫 `callGemini` 用 FAST_MODEL,失敗再呼叫 `callGemini` 用備援模型 | 不碰 lib/gemini/client.ts | `GeminiResult` 失敗只有 `message`,無法可靠分辨「503 用盡」與 429/401/網路例外;只能解析中文訊息字串(脆弱,訊息一改就壞)或擴充 `GeminiResult`(違反 Backward-Compatible Contract) |
| B. 替 `callGemini` 加可選參數 `fallbackModel` | `callGemini` 多收一個 `fallbackModel` | 呼叫端寫法最短;分類資訊留在 client 內 | 修改 `callGemini` 簽章,須同步修改 gemini-retry 的 Backward-Compatible Contract 需求文字;所有呼叫端(含反思)的介面變寬,容易誤傳 |
| C. 在 client 新增 `callGeminiWithFallback`(選定) | 與 `callGemini` 共用內部的單一模型重試函式,內部能拿到「是否為重試用盡的暫時性 5xx」;對外只回 `GeminiResult` | `callGemini` 簽章與型別完全不動,不需修改 Backward-Compatible Contract;分類在 client 內、不靠字串解析;模型選擇仍由翻譯模組決定 | lib/gemini/client.ts 多一個匯出函式與一個內部函式 |

選定 C。實作方式:把現有重試迴圈抽成 client 內部(不匯出)的單一模型函式,回傳 `GeminiResult` 加上內部欄位(失敗時帶「是否為重試用盡的暫時性 5xx」旗標與狀態碼);`callGemini` 呼叫它並只回傳 ok 與 text,或 ok 與 message(重建物件,不讓內部欄位外洩);`callGeminiWithFallback` 呼叫它兩次並決定是否備援。

### 只有重試用盡的暫時性 5xx 才觸發備援

觸發條件:主模型最後一次嘗試的 HTTP 狀態碼屬於 500/502/503/504(即 `RETRYABLE_STATUS_CODES`),且重試次數已用盡。以下情況一律不備援,維持立即回傳主模型的失敗結果:

| 主模型失敗類型 | 備援? | 理由 |
| -------------- | ------ | ---- |
| 500/502/503/504 重試用盡 | 是 | 主模型容量問題,換模型有機會成功 |
| 429 | 否 | 主模型配額問題;備援只會再燒另一個模型的稀少額度,且多半同樣是額度問題 |
| 401/403 | 否 | 金鑰問題,換模型無法解決 |
| 其他 4xx(如 400) | 否 | 請求本身有問題 |
| fetch 丟出例外(網路) | 否 | 非模型端問題;沿用既有「網路例外立即失敗」 |
| HTTP 200 但無內容 | 否 | 沿用既有行為,並避免重複消耗備援額度 |

### 備援只做一次嘗試並受總時間預算限制

時間分析(目前 `maxDuration = 60`):

- 主模型:等待 15 秒以上、未滿 17 秒,加上 5 次往返。往返很快時約 20 秒內;過載時單次 503 可能數秒才回,最壞情況可能已用掉 40 秒以上。
- 備援:gemini-3.6-flash 曾實測回一句話要 25–38 秒。若備援也套用 4 次重試,最壞情況會遠超 60 秒;即使只做 1 次,「主模型最壞耗時 + 備援 30 秒以上」也可能超過 60 秒。

因此:

1. 備援為單次嘗試,重試次數為 0,不做任何 sleep。
2. 總預算 `OVERALL_BUDGET_MS = 55000`(從 `callGeminiWithFallback` 開始計時;預留 5 秒給快取寫入與回應)。
3. 備援請求以 `AbortSignal.timeout` 設定逾時:逾時毫秒數為 `FALLBACK_MAX_TIMEOUT_MS`(30000)與「總預算減已耗時」兩者的較小值。
4. 若算出的逾時毫秒數小於 `FALLBACK_MIN_TIMEOUT_MS`(8000),代表剩餘時間不足以讓備援合理完成,直接略過備援並回傳主模型的失敗訊息(日誌記錄略過原因)。
5. 逾時中止會讓 fetch 丟出例外;此例外在備援路徑上視為「備援失敗」,最後仍回傳主模型的友善訊息。主模型路徑不加逾時(維持 extend-gemini-retry-backoff 的 Non-Goal:不新增 AbortController)。

結論:`maxDuration = 60` 維持不變即足夠,因為備援至多使整體在約 55 秒內結束;代價是慢速的 gemini-3.6-flash 可能被 30 秒逾時截斷(見 Risks)。

時間情境:

| 情境 | 主模型耗時 | 備援逾時 | 整體最壞耗時 |
| ---- | ---------- | -------- | ------------ |
| 503 很快回(約 1 秒/次) | 約 20 秒 | 30 秒(上限) | 約 50 秒 |
| 503 較慢(約 5 秒/次) | 約 42 秒 | 13 秒(剩餘預算) | 約 55 秒 |
| 主模型已耗時 47 秒以上 | 47 秒以上 | 剩餘不足 8 秒,略過備援 | 與現況相同 |

### 備援也失敗時回傳主模型的失敗訊息

備援失敗(任何原因,包含 429、逾時、空回應)時,`callGeminiWithFallback` 回傳主模型的失敗結果(即「Gemini 服務目前較為繁忙,請稍後再試。(HTTP 503)」)。理由:使用者的起因是主模型 503;顯示備援模型的 429 或逾時訊息會令人困惑(使用者不知道有備援)。備援的失敗細節只寫入伺服器日誌。

### 備援決策寫入伺服器日誌

沿用既有的 `[callGemini]` 前綴,新增四種日誌,皆包含模型名稱:

| 事件 | 層級 | 內容(必含) |
| ---- | ---- | ------------ |
| 觸發備援 | `console.warn` | 主模型名稱、主模型最後的 HTTP 狀態碼、備援模型名稱、字樣 `falling back` |
| 備援成功 | `console.warn` | 備援模型名稱、主模型名稱、字樣 `fallback` 與 `succeeded` |
| 備援失敗 | `console.error` | 備援模型名稱、失敗原因(HTTP 狀態碼或逾時/網路例外) |
| 略過備援 | `console.warn` | 備援模型名稱、剩餘預算毫秒數、字樣 `skipping fallback` |

此外,單一模型重試函式既有的「giving up」日誌改為帶入模型名稱,讓兩個模型的失敗可區分。

### 反思對話不使用備援

反思對話(lib/reflection/generate-reply.ts)維持直接呼叫 `callGemini`,本變更不修改它。取捨:

- 反思目前以 gemini-3.1-flash-lite 為主(暫時性),若加備援會改打 gemini-3.6-flash;而其 prompt 含論文全文,在慢的 gemini-3.6-flash 上很可能超過 55 秒預算,備援成功率低。
- 反思的每日額度與備援共用同一個 gemini-3.6-flash 池,擴大備援範圍會加劇額度消耗(見 Risks)。
- 反思失敗時不寫入任何訊息,使用者重送即可,失敗成本低於翻譯(翻譯是選取後即時看結果)。
- `callGeminiWithFallback` 為通用函式,若日後把 `REFLECTION_MODEL` 還原為 gemini-3.6-flash,可另案以 gemini-3.1-flash-lite 為反思的備援(方向相反,額度成本較低)。

## Implementation Contract

**Behavior(使用者與營運者觀察到的):**

- 翻譯選取範圍時,若 gemini-3.1-flash-lite 連續 5 次嘗試皆回 500/502/503/504,系統改用 gemini-3.6-flash 發出一次請求;成功則照常回傳並快取翻譯,使用者看不到失敗。
- 備援也失敗或被略過時,使用者看到與現況相同的訊息「Gemini 服務目前較為繁忙,請稍後再試。(HTTP <主模型最後狀態碼>)」。
- Vercel 伺服器日誌可看到 `[callGemini]` 開頭的備援觸發、成功、失敗或略過紀錄,內含兩個模型名稱。

**Interface / data shape:**

- 新增匯出於 lib/gemini/client.ts 的 `callGeminiWithFallback`,接收 prompt、apiKey、primaryModel、fallbackModel 與可選的 retryDeps,回傳 `Promise<GeminiResult>`。primaryModel 與 fallbackModel 皆為必填字串。
- `callGemini` 簽章不變(prompt、apiKey、可選 model、可選 retryDeps,回傳 `Promise<GeminiResult>`);`GeminiResult` 型別不變;`callGemini` 回傳的失敗物件只含 ok 與 message 兩個欄位。
- 內部測試接縫 `retryDeps` 擴充為 sleep 加可選的 now(預設為 `Date.now`,用於預算計算),不匯出型別、正式呼叫端不傳。
- `translateWithGemini` 的簽章與回傳型別不變;內部改呼叫 `callGeminiWithFallback`,primaryModel 為 gemini-3.1-flash-lite,fallbackModel 為 gemini-3.6-flash。
- 常數(僅在 client 內):`OVERALL_BUDGET_MS = 55000`、`FALLBACK_MAX_TIMEOUT_MS = 30000`、`FALLBACK_MIN_TIMEOUT_MS = 8000`、備援重試次數 0。

**Failure modes:**

- 永不丟出例外:所有路徑皆解析為 `GeminiResult`。
- 429/401/403/其他 4xx、網路例外、200 空回應:不備援,主模型路徑 fetch 恰好 1 次(429 等)或沿用既有次數,回傳既有友善訊息。
- 備援失敗(含逾時中止):回傳主模型的友善訊息,不回傳備援的錯誤。
- 備援成功:回傳成功結果,與主模型成功無法從回傳值區分。

**Acceptance criteria:**

- lib/gemini/client.test.ts 新增的備援測試通過:503 用盡後打備援且成功(fetch 共 6 次,第 6 次的網址含 gemini-3.6-flash)、備援失敗回主模型訊息、429/401/網路例外/空回應不備援、剩餘預算不足時略過備援、備援請求帶有逾時 signal 而主模型請求沒有、日誌含兩個模型名稱。
- lib/translation/gemini.test.ts 新增測試:主模型用盡 503 後第 6 次請求使用 gemini-3.6-flash;既有「使用 gemini-3.1-flash-lite」測試仍通過。
- 既有 callGemini 測試與 lib/reflection 測試不修改即通過;npx vitest run 全數通過、npx tsc --noEmit 無錯誤。

**Scope boundaries:**

- In scope:lib/gemini/client.ts(新函式、內部重構、日誌)、lib/translation/gemini.ts(改呼叫新函式)、兩者的測試檔。
- Out of scope:lib/reflection/generate-reply.ts、app/api/reflect/route.ts、app/api/translate/route.ts(`maxDuration` 維持 60)、components 與 app 下任何檔案、翻譯快取、improve-reader-tablet-layout 變更。

## Risks / Trade-offs

- [備援消耗 gemini-3.6-flash 每日約 20 次的免費額度,與日後還原後的反思對話共用] → 每次翻譯請求最多只花 1 次備援;備援只在主模型重試用盡的 5xx 時觸發(相對少見);翻譯有快取,相同選取範圍不會重複呼叫;備援遇 429 不重試。最壞情況:主模型長時間過載時,使用者翻譯 20 個不同選取範圍即可用完當日額度,屆時反思若已還原為 gemini-3.6-flash 會收到 429。目前反思仍用 gemini-3.1-flash-lite,所以今天不受影響;還原 `REFLECTION_MODEL` 前需重新評估(見 Open Questions)。
- [若 gemini-3.6-flash 當日額度已用完(這正是 REFLECTION_MODEL 暫時借用 gemini-3.1-flash-lite 的原因),備援第一次呼叫就會 429] → 該次備援快速失敗(不重試),回傳主模型訊息,使用者體驗與現況相同,只多一次很快的失敗請求與一行日誌。
- [gemini-3.6-flash 曾實測回一句話要 25–38 秒,備援可能被 30 秒逾時截斷而白白失敗] → 逾時只作用於備援,不影響主模型;失敗時仍回友善訊息。上線後以日誌觀察備援成功率,必要時調整 `FALLBACK_MAX_TIMEOUT_MS`。
- [被逾時中止的請求仍可能已被 Google 計入額度] → 接受;以逾時上限與單次嘗試控制損失。
- [使用者等待變長:最壞情況約 55 秒才看到失敗(現況約 20 秒)] → 僅在主模型已持續過載時發生;備援成功時是以更長的等待換取成功。前端目前沒有倒數或進度提示,不在本變更範圍。
- [備援的翻譯品質或風格可能與主模型略有差異,且會被快取] → 兩者同為 Gemini 翻譯,差異可接受;快取鍵不含模型,不另外處理。
- [`callGemini` 內部重構可能引入迴歸] → 既有 callGemini 測試不修改即須通過,並採 TDD 先補備援測試。

## Migration Plan

1. 先 archive extend-gemini-retry-backoff(其 delta spec 修改 gemini-retry 的既有需求),再 archive 本變更;兩者修改的需求不重疊,不會衝突。
2. 無資料遷移與環境變數變更。
3. 部署後在 Vercel 日誌搜尋 `[callGemini]` 與 `falling back`,確認備援出現頻率與成功率。
4. 回滾:把 `translateWithGemini` 改回呼叫 `callGemini` 並傳入 FAST_MODEL 即可停用備援;`callGeminiWithFallback` 可留在 client 不影響其他呼叫端。

## Open Questions

- Google 是否把回 503 的請求計入每日額度?若會,主模型的 5 次嘗試本身就消耗 gemini-3.1-flash-lite 額度,需評估(本變更不改變此行為)。
- 現在 gemini-3.6-flash 回一句話實際要多久?25–38 秒是較早的實測。建議 apply 前後各量一次;若仍是 25 秒以上,30 秒的備援逾時成功率偏低,可考慮降低 thinking(需修改請求本文,本變更不做)。
- 是否需要備援開關(環境變數)或每日備援次數上限來保護 gemini-3.6-flash 額度?本變更不做;建議在把 `REFLECTION_MODEL` 還原為 gemini-3.6-flash 之前重新評估,屆時可能改為不讓翻譯備援使用該模型,或升級計費。
- 日後是否讓反思對話也有備援(方向為 gemini-3.6-flash 主、gemini-3.1-flash-lite 備援)?待 `REFLECTION_MODEL` 還原後另案決定。
- Vercel 方案實際可用的 `maxDuration` 上限是否為 60 秒?沿用 extend-gemini-retry-backoff 的假設;若部署時被平台限制得更低,需下修 `OVERALL_BUDGET_MS`。
