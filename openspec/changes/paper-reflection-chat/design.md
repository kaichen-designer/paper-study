## Context

`app/api/translate/route.ts` 已建立「伺服器端讀取 `GEMINI_API_KEY`、呼叫 Gemini、金鑰不外流到前端」的模式(`lib/translation/gemini.ts`、`lib/translation/translate-text.ts`)。`components/PdfViewer.tsx` 目前只透過 `window.getSelection()` 抽取使用者選取的片段文字,沒有「抽取整篇論文所有頁面文字」的能力。`notes` 資料表與 `lib/notes/queries.ts` 已建立「user_id 由 `auth.getUser()` 推導、RLS 以 user_id 為範圍」的存取模式。本次變更要新增一個獨立的對話功能,重用既有的 Gemini 呼叫模式與存取模式,但資料形狀(多輪對話訊息)與既有的 notes/translation_cache 都不同,需要新的資料表。

## Goals / Non-Goals

**Goals:**

- 使用者可在閱讀論文的任何時候輸入心得,取得 AI 根據論文全文內容給出的具體回饋
- 對話持久化,同一篇論文的對話可跨裝置、跨工作階段接續
- 沿用既有的金鑰保護模式(GEMINI_API_KEY 只在伺服器端使用)與資料存取模式(user_id 由 session 推導)

**Non-Goals:**

- 不做跨論文的對話或比較
- 不做對話評分、進度追蹤或學習成效量化
- 不在本次處理「重複傳送全文造成的 token 消耗」最佳化(見 Risks/Trade-offs)

## Decisions

### 新增獨立的 `reflection_messages` 資料表,而非重用 notes 表

對話訊息在資料形狀上與筆記本質不同:每則訊息有明確的 `role`(user 或 assistant)、屬於一個連續對話串流,且數量會隨對話持續增長(一篇論文可能有數十則訊息),不像筆記是使用者主動建立的一則則獨立記錄。硬塞進 notes 表會讓 notes 的查詢邏輯(`listNotesForPaper`)混雜兩種語意不同的資料,增加後續維護成本。新表 `reflection_messages` 沿用與 notes 相同的 RLS 模式(`user_id` 欄位、以 `auth.uid() = user_id` 限定存取)。

### 論文全文抽取:逐頁呼叫 pdf.js `getTextContent`,於使用者首次開啟對話面板時執行一次

`lib/pdf/extract-full-text.ts` 提供 `extractFullText(pdfDocument): Promise<string>`,遍歷 PDF 文件的每一頁呼叫 pdf.js 的 `getTextContent()` 並串接文字。由於論文可能有數十頁,選擇在使用者實際開啟對話面板時才執行一次全文抽取(而非一開啟論文閱讀畫面就抽取),避免非必要的運算與延遲;抽取結果只在當次對話階段的前端記憶體中使用,不落地儲存(全文內容本身已存在於 PDF 檔案,不需要在資料庫中重複一份)。

### 每次 API 呼叫都重新傳送論文全文與對話歷史,不做 context 快取

Gemini API 支援 context caching 機制可以降低重複傳送大量背景文字的成本,但需要額外的快取生命週期管理與失效處理邏輯。這是個人使用、對話頻率低的工具,論文全文通常在數千到數萬字元之間,遠低於 Gemini 模型的 context window 上限,直接在每次請求把「論文全文 + 目前對話歷史 + 使用者新輸入」一起送出,實作簡單且在免費額度內可負擔。此為已知取捨,若日後對話量大幅增加導致額度吃緊,才需要導入快取機制。

### API route 沿用 `/api/translate` 的金鑰保護與錯誤處理模式

新增 `app/api/reflect/route.ts`,比照 `app/api/translate/route.ts`:伺服器端讀取 `GEMINI_API_KEY`(不使用 `NEXT_PUBLIC_` 前綴)、呼叫失敗時回傳明確錯誤狀態而非靜默失敗、金鑰不出現在任何回應內容或前端程式碼中。對話邏輯抽成 `lib/reflection/generate-reply.ts`,比照 `lib/translation/translate-text.ts` 的可測試 orchestration 函式模式(依賴以參數注入,可在測試中替換為假的 Supabase/Gemini 實作)。

### 對話面板隨時可開啟,不綁定「讀完論文」的判斷邏輯

不偵測使用者是否已讀到最後一頁,對話面板是一個獨立區塊(比照 `TranslationPanel`/`NoteForm` 的呈現方式),使用者隨時可以展開輸入心得。此決策已與使用者確認(見對應的 spectra-discuss 記錄)。

## Implementation Contract

**行為(使用者可觀察到的結果):**
- 論文閱讀畫面上有一個「心得對話」區塊,任何時候都可以輸入文字並送出
- 送出後,畫面顯示使用者剛輸入的內容,並在稍後顯示 AI 根據論文全文給出的回應文字
- AI 的回應內容會具體回應使用者寫的心得(例如指出心得中提到的論點是否符合論文原文、補充論文中提到但心得沒提到的重點),而非泛用的鼓勵語句
- 重新整理頁面、或以同帳號在另一裝置開啟同一篇論文,先前的對話紀錄(使用者訊息與 AI 回應)依原本的時間順序完整顯示,使用者可以接著輸入新的訊息延續對話
- 若 Gemini 呼叫失敗(額度用罄、逾時等),畫面顯示明確的錯誤訊息,使用者剛輸入但尚未成功送出的文字不會遺失(仍留在輸入框中可重新送出)

**介面/資料形狀:**
- 新資料表 `reflection_messages`:`id, paper_id, user_id, role ('user' | 'assistant'), content text, created_at`
- `lib/reflection/queries.ts` 提供 `listReflectionMessages(supabase, paperId)`(依 `created_at` 由舊到新排序)與 `saveReflectionMessage(supabase, { paperId, role, content })`(`user_id` 一律由 `supabase.auth.getUser()` 推導,函式簽章不接受呼叫端傳入 `user_id`)
- `lib/pdf/extract-full-text.ts` 提供 `extractFullText(pdfDocument): Promise<string>`
- `lib/reflection/generate-reply.ts` 提供 `generateReflectionReply({ supabase, paperId, paperFullText, conversationHistory, userMessage, apiKey, deps })`,回傳 `{ ok: true; reply: string } | { ok: false; message: string }`
- `POST /api/reflect`:輸入 `{ paperId, message, paperFullText }`,伺服器端讀取該論文既有對話歷史、呼叫 Gemini、將使用者訊息與 AI 回應都寫入 `reflection_messages`,輸出 `{ reply: string }`

**失敗模式:**
- Gemini 呼叫失敗時,`/api/reflect` 回傳明確錯誤訊息與非 200 狀態碼,不寫入任何 `reflection_messages` 記錄(避免留下只有使用者訊息、沒有對應回應的不完整對話)
- 論文全文抽取失敗(例如 PDF 損毀)時,對話面板顯示錯誤訊息,不阻擋使用者繼續使用翻譯或筆記等其他功能

**驗收標準:**
- 單元測試涵蓋 `lib/reflection/queries.ts` 的 user_id 推導邏輯(比照 `lib/notes/queries.test.ts` 的測試模式)
- 單元測試涵蓋 `lib/reflection/generate-reply.ts`:確認呼叫 Gemini 時傳入的 prompt 內容包含論文全文與使用者訊息;確認 Gemini 呼叫失敗時回傳 `{ ok: false }` 且不觸發訊息寫入
- 單元測試涵蓋 `lib/pdf/extract-full-text.ts`:給定模擬的多頁 PDF 文件物件,確認回傳的文字包含所有頁面內容且依頁碼順序串接
- 手動驗證:於同一論文送出心得、確認收到具體回應;重新整理頁面確認對話仍在;以另一瀏覽器設定檔用同帳號登入確認對話可見

**範圍邊界:**
- 範圍內:單篇論文的心得輸入、AI 回饋生成、對話持久化與跨裝置讀取
- 範圍外:跨論文比較、對話評分/進度追蹤、context 快取最佳化、語音輸入

## Risks / Trade-offs

- [每次對話請求都重新傳送論文全文,對話越長、往返次數越多,累積的 token 消耗越高] → 個人使用場景下的對話頻率低,在 Gemini 免費額度內可負擔;若日後成為瓶頸,設計已預留 `generate-reply.ts` 的 deps 注入介面,方便替換為帶 context 快取的實作
- [論文全文可能包含公式、圖表說明等 pdf.js 文字抽取不易正確處理的內容,可能讓 AI 的背景資訊有缺漏或亂序] → 這屬於 AI 回饋品質的已知限制,不影響核心對話功能運作;不因此阻擋功能上線
- [對話歷史隨使用時間增長,單次 API 請求的 payload 會越來越大] → 個人使用累積速度慢,短期內不構成問題;不在本次範圍內處理歷史訊息截斷或摘要

## Migration Plan

在 Supabase SQL Editor 執行新增 `reflection_messages` 表與 RLS 政策的遷移(附加到 `lib/supabase/schema.sql`)。全新資料表,不影響既有資料。部署時需確認 Vercel 專案的 `GEMINI_API_KEY` 環境變數已設定(與翻譯功能共用同一組金鑰,不需要額外申請)。
