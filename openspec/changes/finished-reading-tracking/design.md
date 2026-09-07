## Context

`papers` 表(`lib/supabase/schema.sql`)目前只有 `id`/`user_id`/`title`/`storage_path`/`uploaded_at`/`metadata`,沒有任何「閱讀進度/完成狀態」欄位。`papers_update_own` RLS policy(`for update using (auth.uid() = user_id)`)已經存在,PWA 這邊要寫入的新欄位不需要新增 SQL policy。`PdfViewer.tsx` 已經內部持有 `currentPage`/`numPages` 狀態,並透過 `onPageChange` 把目前頁碼往上回報給 `PaperReader.tsx`,但目前不會回報「是否在最後一頁」。`app/library/[id]/page.tsx` 已經在伺服器端用 `getPaperById` 抓到完整的 `Paper` row 並往下傳給 `PaperReader`(比照 `initialNotes` 的模式)。

這次變更的資料只在 PWA 內被寫入三個欄位(`reached_last_page`/`finished_reading`/`finished_at`),第四個欄位(`imported_to_detabase`)由外部的 `paper detabase` 專案用 Supabase service role key 寫回——這個 change 只負責讀取並顯示它,不在 PWA 任何程式碼路徑寫入它。

## Goals / Non-Goals

**Goals:**

- 自動偵測「使用者是否曾經翻到 PDF 最後一頁」,不需要使用者手動操作。
- 提供明確的「標記為已讀完」動作,且只有在滿足上述條件時才能觸發。
- 在論文庫列表與閱讀頁呈現「已讀完」「已匯入 paper detabase」狀態徽章。

**Non-Goals:**

- 不做「取消標記」/復原流程。
- 不在 PWA 內建立任何給外部系統呼叫的新 API endpoint。
- 不追蹤「翻到最後一頁」以外的閱讀進度細節(例如停留時間、捲動百分比)。

## Decisions

### PdfViewer 只回報「到達最後一頁」事件,不擁有持久化決策

比照 `onStrokeComplete`/`onPageChange` 的既有分工:`PdfViewer` 新增 `onReachedLastPage?: () => void` prop,在 `currentPage` 經 `clampPage` 後等於 `numPages` 時呼叫(沿用既有的 `useEffect` 監看 `currentPage`/`numPages` 的作法,新增一個效果)。`PdfViewer` 每次「目前就在最後一頁」都會呼叫這個 callback(包含使用者來回翻頁又翻回最後一頁的情況),不在元件內做「只呼叫一次」的節流——是否需要避免重複寫入,交給擁有持久化狀態的呼叫方(`PaperReader`)判斷,`PdfViewer` 保持無狀態、單純回報事實。

### PaperReader 用既有 Paper row 欄位做寫入節流,避免重複打 Supabase

`PaperReader` 新增 `initialReachedLastPage`/`initialFinishedReading`/`initialImportedToDetabase` props(比照 `initialNotes` 的伺服器端資料流,由 `app/library/[id]/page.tsx` 把 `paper.reached_last_page` 等欄位往下傳),並用 `useState` 持有對應狀態。`onReachedLastPage` 觸發時,只有在目前狀態的 `reached_last_page` 仍是 false 時才呼叫 `markReachedLastPage`(避免每次翻頁事件都打一次 Supabase);成功後把本地狀態設為 true。

### 新查詢模組 `lib/reading-completion/queries.ts`,沿用既有的 no-userId-parameter 慣例

比照 `lib/annotations/queries.ts`/`lib/papers/queries.ts` 的存取模式:兩個新函式都不接受 `userId` 參數,擁有權完全交給 `papers_update_own` RLS policy 驗證。用 `.select().single()` 接在 `.update()` 後面,讓「更新到 0 筆」(例如論文不存在或不屬於目前使用者)明確變成 PostgREST 錯誤並拋出 `Error`,而不是靜默地什麼事都沒發生。

```ts
export async function markReachedLastPage(supabase: SupabaseClient, paperId: string): Promise<void>
export async function markFinishedReading(supabase: SupabaseClient, paperId: string): Promise<Paper>
```

`markFinishedReading` 的 `finished_at` 由呼叫端(client)產生 ISO timestamp 寫入,不使用資料庫端 `now()` 預設值——因為這是 UPDATE 而非帶預設值的 INSERT,寫法上比新增一個資料庫層級的 trigger 簡單很多,且這個時間戳的精確度需求(「大約什麼時候標記的」)不需要資料庫端時間權威性。

### 「標記為已讀完」按鈕的啟用條件與錯誤呈現

按鈕只有在 `reachedLastPage === true` 且 `finishedReading === false` 時才可點擊(`finishedReading === true` 時直接換成徽章,不顯示按鈕,對應 Non-Goals 的「不做取消標記」)。未達最後一頁時按鈕顯示為 disabled 並附一行提示文字,說明需要先讀到最後一頁。錯誤呈現比照 `components/PaperUpload.tsx`/`components/ReflectionChat.tsx` 既有的 `status: { kind: "idle" | "error"; message?: string }` + `<p role="alert">` 慣例,`markFinishedReading` 失敗時顯示錯誤訊息,不樂觀更新本地的 `finishedReading` 狀態。

## Implementation Contract

**行為(使用者可觀察到的):**

- 閱讀論文時翻到 PDF 最後一頁後(不需要額外動作),閱讀頁會出現可點擊的「標記為已讀完」按鈕;翻到最後一頁之前,按鈕維持 disabled 並顯示提示文字。
- 點擊「標記為已讀完」後,按鈕消失,改為顯示「✅ 已讀完」徽章;若該次請求失敗,顯示錯誤訊息,按鈕維持原本可點擊狀態以便重試。
- 論文庫列表(`/library`)裡每篇論文旁邊,若該論文 `finished_reading` 為 true 顯示「✅ 已讀完」徽章;若 `imported_to_detabase` 為 true 額外顯示「📥 已匯入」徽章。
- 重新整理頁面後,已讀完/已匯入的徽章狀態維持正確(資料來自 Supabase,不依賴任何本機快取)。

**介面/資料形狀:**

- `lib/supabase/schema.sql`:`papers` 表新增 `reached_last_page boolean not null default false`、`finished_reading boolean not null default false`、`finished_at timestamptz`、`imported_to_detabase boolean not null default false`。
- `lib/papers/queries.ts` 的 `Paper` type 新增這四個欄位。
- `lib/reading-completion/queries.ts` 匯出 `markReachedLastPage(supabase, paperId): Promise<void>` 與 `markFinishedReading(supabase, paperId): Promise<Paper>`,兩者都不接受 `userId`/`user_id` 參數。
- `components/PdfViewer.tsx` 新增 `onReachedLastPage?: () => void` prop。
- `app/library/[id]/PaperReader.tsx` 新增 `initialReachedLastPage: boolean`、`initialFinishedReading: boolean`、`initialImportedToDetabase: boolean` props。
- `components/PaperList.tsx` 透過既有的 `papers: Paper[]` prop(型別擴充後自動取得新欄位),不需要新增 prop。

**失敗模式:**

- `markReachedLastPage`/`markFinishedReading` 在 Supabase 回傳錯誤或 0 筆更新時拋出 `Error`,訊息包含操作名稱與底層錯誤訊息。
- `markReachedLastPage` 失敗時(翻頁時靜默觸發,不是使用者主動操作)只記錄失敗、不顯示任何 UI 錯誤,也不變更本地 `reachedLastPage` 狀態——下次使用者翻到最後一頁時會自然重試。
- `markFinishedReading` 失敗時(使用者主動點擊觸發)顯示 `role="alert"` 錯誤訊息,按鈕保持可點擊以便重試。

**驗收標準:**

- `lib/reading-completion/queries.test.ts`:涵蓋 `markReachedLastPage`/`markFinishedReading` 呼叫 `.update()`/`.eq("id", paperId)` 的正確欄位,以及 Supabase 回傳錯誤或 0 筆時拋出 Error。
- `components/PdfViewer.test.tsx`:新增測試涵蓋「導覽到最後一頁時呼叫 onReachedLastPage」「不在最後一頁時不呼叫」。
- `app/library/[id]/PaperReader.test.tsx`:新增測試涵蓋「onReachedLastPage 觸發且尚未讀完時呼叫 markReachedLastPage」「已經是 reached_last_page=true 時再次觸發不重複呼叫」「點擊標記已讀完按鈕成功後畫面顯示已讀完徽章、按鈕消失」「標記已讀完失敗時顯示錯誤訊息」。
- `components/PaperList.test.tsx`:新增測試涵蓋「finished_reading 為 true 時顯示已讀完徽章」「imported_to_detabase 為 true 時顯示已匯入徽章」「兩者皆 false 時不顯示任何徽章」。

**範圍邊界:**

- 範圍內:上述四個新欄位、翻頁自動偵測、手動標記已讀完按鈕、論文庫與閱讀頁的狀態徽章顯示。
- 範圍外:`paper detabase` 專案內的匯入腳本(`import_from_pwa.py`/`mark_imported.py`)、任何新的對外 API endpoint、取消標記/復原流程、notes/reflection_messages 表的欄位異動。

## Risks / Trade-offs

- [風險] `onReachedLastPage` 在使用者反覆翻頁經過最後一頁時會重複觸發呼叫端邏輯 → [因應] `PaperReader` 用目前的 `reachedLastPage` 狀態值節流,已經是 true 就不再呼叫 `markReachedLastPage`,只有第一次觸發真正打 Supabase。
- [風險] `imported_to_detabase` 由外部專案透過 service role key 直接寫回,PWA 這邊完全無法驗證寫入的正確性或時機 → [因應] 這是刻意的設計(見 proposal.md 的 Non-Goals),PWA 只負責忠實顯示該欄位的值,匯入邏輯的正確性由 `paper detabase` 專案自己的測試/change 負責。
