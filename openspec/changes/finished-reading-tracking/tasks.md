## 1. 資料模型與查詢模組(基礎、彼此獨立的檔案)

- [x] [P] 1.1 在 lib/supabase/schema.sql 的 `papers` 表新增四個欄位:`reached_last_page boolean not null default false`、`finished_reading boolean not null default false`、`finished_at timestamptz`、`imported_to_detabase boolean not null default false`;驗證方式:檢視 SQL 語法正確(`create table`/`alter table` 慣例與檔案其餘部分一致),並在專案的 Supabase SQL editor 手動執行確認無誤(此步驟需使用者協助執行,因為這是遠端資料庫變更)
- [x] [P] 1.2 擴充 lib/papers/queries.ts 的 `Paper` type,新增 `reached_last_page: boolean`、`finished_reading: boolean`、`finished_at: string | null`、`imported_to_detabase: boolean` 四個欄位;驗證方式:`npx tsc --noEmit` 通過,既有使用 `Paper` type 的檔案(components/PaperList.tsx、app/library/[id]/page.tsx)不需修改就能編譯成功
- [x] [P] 1.3 建立新模組 lib/reading-completion/queries.ts,實作 `markReachedLastPage(supabase, paperId): Promise<void>` 與 `markFinishedReading(supabase, paperId): Promise<Paper>`,兩者皆不接受 `userId` 參數,擁有權交給既有 `papers_update_own` RLS policy,並用 `.update().eq("id", paperId).select().single()` 讓 0 筆更新變成明確的拋出錯誤(對應設計決策「新查詢模組 `lib/reading-completion/queries.ts`,沿用既有的 no-userId-parameter 慣例」與 spec 的 Automatic Last-Page Detection、Manual Finished-Reading Mark 需求);驗證方式:新增 lib/reading-completion/queries.test.ts,涵蓋「markReachedLastPage 呼叫正確的 update 欄位與 eq 條件」「markFinishedReading 寫入 finished_reading=true 與 finished_at 時間戳」「Supabase 回傳錯誤時兩者皆拋出 Error」三類測試

## 2. PdfViewer:回報到達最後一頁

- [x] [P] 2.1 為 PdfViewer 新增 `onReachedLastPage?: () => void` prop,在目前頁碼(經 `clampPage`)等於 `numPages` 時呼叫,不做節流(對應設計決策「PdfViewer 只回報「到達最後一頁」事件,不擁有持久化決策」與 spec 的 Automatic Last-Page Detection 需求);驗證方式:components/PdfViewer.test.tsx 新增測試——(a) 導覽到最後一頁時呼叫 onReachedLastPage,(b) 停留在非最後一頁時不呼叫

## 3. PaperReader:自動追蹤與手動標記

- [x] 3.1 為 PaperReader 新增 `initialReachedLastPage: boolean`、`initialFinishedReading: boolean`、`initialImportedToDetabase: boolean` props 與對應 state,並把 `onReachedLastPage` 接到 PdfViewer 上——觸發時只有在目前 `reachedLastPage` 狀態仍是 false 時才呼叫 `markReachedLastPage`,成功後把本地狀態設為 true(對應設計決策「PaperReader 用既有 Paper row 欄位做寫入節流,避免重複打 Supabase」與 spec 的 Automatic Last-Page Detection 需求);驗證方式:app/library/[id]/PaperReader.test.tsx 新增測試——(a) `initialReachedLastPage=false` 時觸發 onReachedLastPage 會呼叫一次 `markReachedLastPage`,(b) `initialReachedLastPage=true` 時觸發 onReachedLastPage 不會再呼叫 `markReachedLastPage`
- [x] 3.2 在 PaperReader 新增「標記為已讀完」按鈕:只有在 `reachedLastPage` 為 true 且 `finishedReading` 為 false 時可點擊(未達最後一頁時顯示 disabled 按鈕與提示文字),點擊呼叫 `markFinishedReading`,成功後把按鈕換成「✅ 已讀完」徽章,若 `finishedReading` 為 true 也顯示「📥 已匯入」徽章(當 `importedToDetabase` 為 true 時);失敗時比照 components/PaperUpload.tsx 既有的 `status: {kind, message}` + `<p role="alert">` 慣例顯示錯誤訊息,不樂觀更新狀態(對應設計決策「「標記為已讀完」按鈕的啟用條件與錯誤呈現」與 spec 的 Manual Finished-Reading Mark 需求);驗證方式:app/library/[id]/PaperReader.test.tsx 新增測試——(a) 未達最後一頁時按鈕為 disabled,(b) 已達最後一頁時按鈕可點擊、點擊成功後顯示已讀完徽章且按鈕消失,(c) 點擊失敗時顯示 `role="alert"` 錯誤訊息且徽章不出現;在 app/globals.css 新增 `.reading-status-badge` 樣式呈現徽章視覺

## 4. 頁面層級整合

- [x] 4.1 更新 app/library/[id]/page.tsx,把伺服器端取得的 `paper.reached_last_page`/`paper.finished_reading`/`paper.imported_to_detabase` 透過對應的 `initial*` props 傳給 PaperReader;驗證方式:app/library/[id]/PaperReader.test.tsx 既有的 render 呼叫模式不受影響(props 為 optional 或有預設值),另外以手動檢視程式碼確認三個欄位都有從 `paper` 物件正確傳遞,不是寫死的常數

## 5. PaperList:論文庫列表徽章

- [x] [P] 5.1 在 components/PaperList.tsx 依 `paper.finished_reading`/`paper.imported_to_detabase` 顯示「✅ 已讀完」「📥 已匯入」徽章,兩者皆 false 時不顯示任何徽章(對應 spec 的 Reading and Import Status Visibility 需求,含 badge combinations 範例表);驗證方式:components/PaperList.test.tsx 新增測試,涵蓋範例表列出的四種欄位組合分別對應的徽章顯示情況

## 6. 驗證與部署

- [x] 6.1 執行完整測試套件(`npx vitest run`)與 `npm run build`,確認全數通過且沒有失敗測試;通過後以 `npx vercel --prod --yes` 部署,並用 curl 確認部署後的 `/login` 路徑回傳 HTTP 200
