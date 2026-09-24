## 1. 資料結構

- [ ] 1.1 在 lib/supabase/schema.sql 加入 `papers.reading_stage`（text、not null、default `'up_next'`、check 值域為 up_next/reading/finished）與既有資料列的回填語句，落實設計決策「閱讀階段以 reading_stage 為單一事實來源」。完成後 schema.sql 重複執行不會出錯，且回填後 `finished_reading = true` 的論文其 `reading_stage` 為 `'finished'`。驗證：於 Supabase SQL editor 連續執行 schema.sql 兩次皆成功，並以 select 確認回填結果。
- [ ] 1.2 在 lib/supabase/schema.sql 加入 `papers.deleted_at`（timestamptz、nullable）與涵蓋 `user_id` 與 `deleted_at` 的索引，落實設計決策「軟刪除使用 deleted_at 時間戳」。完成後既有論文的 `deleted_at` 皆為 null。驗證：執行 schema.sql 後以 select 確認欄位存在且預設為 null。

## 2. 閱讀階段的單一寫入點

- [ ] 2.1 [P] 在 lib/papers/reading-stage.test.ts 寫出 Reading Stage Is The Single Source Of Truth For Completion 的失敗測試：切換到 `finished` 會同時寫入 `finished_reading = true` 與 `finished_at`；由 `finished` 切離會寫入 `finished_reading = false` 與 `finished_at = null`；傳入非法階段值會拋錯。驗證：`npx vitest run lib/papers/reading-stage.test.ts` 三個案例皆因函式尚未存在而失敗。
- [ ] 2.2 在 lib/papers/reading-stage.ts 實作 `setReadingStage`，成為 `reading_stage`、`finished_reading`、`finished_at` 的唯一寫入點，且不接受 `user_id` 參數（擁有者範圍交由 RLS）。驗證：2.1 的測試全數轉為通過。
- [ ] 2.3 將閱讀頁既有的「標記為讀完」流程改為呼叫 `setReadingStage`，使該操作同時設定 `reading_stage`，落實 Reading Stage Is The Single Source Of Truth For Completion。驗證：在 app/library/[id]/PaperReader.test.tsx 新增案例，斷言標記讀完時寫入的階段為 `'finished'`，且原有的標記讀完測試仍通過。

## 3. 論文庫查詢

- [ ] 3.1 [P] 在 lib/papers/queries.ts 實作 `renamePaper`，交付 Paper Renaming：標題前後空白被修剪後寫入，修剪後為空字串則拋錯且不寫入。驗證：lib/papers/queries.test.ts 新增案例涵蓋 spec 範例表的四列輸入。
- [ ] 3.2 [P] 在 lib/papers/queries.ts 實作 `softDeletePaper` 與 `restorePaper`，並讓 `listPapers` 排除 `deleted_at is not null` 者、新增 `listDeletedPapers` 只回傳已刪除者並依 `deleted_at` 由新到舊排序，交付 Paper Removal Is Recoverable。還原後階段維持刪除前的值。驗證：lib/papers/queries.test.ts 斷言兩個列表查詢各自套用的 `deleted_at` 條件與排序方向。
- [ ] 3.3 在 lib/papers/queries.ts 實作 `purgePaper`，交付 Permanent Deletion 並落實設計決策「永久刪除先刪資料列再刪 Storage 檔案」：先刪 `papers` 資料列，成功後以 best-effort 刪除 Storage 物件，Storage 失敗不使整體操作失敗。驗證：lib/papers/queries.test.ts 斷言呼叫順序，以及 Storage 刪除拋錯時 `purgePaper` 仍正常返回。

## 4. 論文庫介面

- [ ] 4.1 在 components/PaperCard.tsx 提供改名操作，交付 Paper Renaming 的使用者路徑：送出非空標題後卡片立即顯示新標題，送出空白標題則顯示錯誤且標題不變。驗證：components/PaperCard.test.tsx 涵蓋這兩條路徑。
- [ ] 4.2 在 components/PaperCard.tsx 提供三階段切換控制項，交付 Reading Stage 並落實設計決策「階段切換完全手動」：卡片顯示目前階段，選擇另一階段後呼叫 `setReadingStage`。驗證：components/PaperCard.test.tsx 斷言選擇階段時傳入的值，並斷言僅渲染卡片不會觸發任何階段寫入。
- [ ] 4.3 在 components/PaperList.tsx 依階段分組呈現論文，交付 Library Grouped By Reading Stage：三組標題為「正在讀」「接下來要讀」「讀完了」，沒有論文的分組不渲染標題。驗證：components/PaperList.test.tsx 涵蓋多階段混合與空分組兩種情況。
- [ ] 4.4 在 components/TrashToggle.tsx 與 components/PaperList.tsx 提供回收筒切換，落實設計決策「回收筒是論文庫的切換而非獨立路由」並交付 Paper Removal Is Recoverable 的使用者路徑：切換開啟時顯示已刪除論文並提供還原，關閉時顯示一般論文庫。移除論文不需確認。驗證：components/TrashToggle.test.tsx 與 components/PaperList.test.tsx 斷言切換後顯示的清單來源改變，且還原後論文回到原階段分組。
- [ ] 4.5 在回收筒的論文卡片提供永久刪除，交付 Permanent Deletion 的使用者路徑：確認對話明確說明會一併刪除的筆記與畫記數量且不可復原，確認後才呼叫 `purgePaper`。驗證：components/PaperCard.test.tsx 斷言未確認時不呼叫 `purgePaper`，以及確認文字包含筆記數量。

## 5. 串接與驗證

- [ ] 5.1 在 app/library/page.tsx 取得一般與已刪除兩份論文清單並傳入 PaperList，使論文庫與回收筒皆有資料來源。驗證：`npx next build` 成功，且以 `npx vitest run` 確認既有的 app/library 相關測試未被破壞。
- [ ] 5.2 全面驗證本變更：`npx vitest run` 全數通過、`npx tsc --noEmit -p tsconfig.json` 無新增錯誤、`npx next build` 成功。驗證：三個指令的輸出皆無失敗項目。
