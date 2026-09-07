## Why

目前 `papers` 表沒有任何「讀完了沒」的紀錄,論文庫裡的每一篇論文狀態都一樣。使用者想把「真正讀完的論文」匯入另一個本機專案(`paper detabase`,一個封閉的個人論文向量資料庫),但那個匯入流程必須能分辨「哪些論文已經讀完、還沒匯入過」——這個判斷資料目前完全不存在,必須先在這裡建立。

## What Changes

- `papers` 表新增四個欄位:`reached_last_page`(是否曾經翻到過 PDF 最後一頁)、`finished_reading`(是否已手動標記為讀完)、`finished_at`(標記讀完的時間)、`imported_to_detabase`(是否已被 `paper detabase` 匯入,由外部腳本用 service role 寫回,本次 change 只負責讀取顯示,不在 PWA 內寫入)。
- `PdfViewer`/`PaperReader` 在使用者導覽到 PDF 的最後一頁時,自動把該篇論文的 `reached_last_page` 設為 true(靜默追蹤,不需使用者動作)。
- 論文閱讀頁新增「標記為已讀完」按鈕,只有在 `reached_last_page` 為 true 時才能點擊;點擊後寫入 `finished_reading = true`、`finished_at = now()`。
- 論文庫列表與閱讀頁顯示「已讀完」「已匯入 paper detabase」徽章,讓使用者能一眼看出目前的匯入候選清單狀態。

## Non-Goals

- 不在 PWA 內建立任何對外 API 讓外部系統呼叫——`paper detabase` 那邊改用 Supabase service role key 直接查詢/寫回 `papers` 表,細節屬於另一個獨立專案的變更,不在這次範圍內。
- 不自動把 `reached_last_page` 當作「已讀完」——兩者是獨立欄位,「已讀完」永遠需要使用者手動按下確認按鈕。
- 不處理「取消標記已讀完」的復原流程——v1 只做正向標記,若標記錯誤需求出現再另外討論。
- 不在這次變更內修改 `notes`/`reflection_messages` 表——`paper detabase` 匯入腳本讀取這兩張表時直接沿用既有結構,不需要新增欄位。

## Capabilities

### New Capabilities

- `reading-completion`: 追蹤論文是否讀完(翻到最後一頁 + 手動標記)、是否已被外部系統匯入,並在 UI 呈現對應狀態

### Modified Capabilities

(none)

## Impact

- Affected specs: reading-completion
- Affected code:
  - New:
    - lib/reading-completion/queries.ts
    - lib/reading-completion/queries.test.ts
  - Modified:
    - lib/supabase/schema.sql
    - lib/papers/queries.ts
    - lib/papers/queries.test.ts
    - components/PdfViewer.tsx
    - components/PdfViewer.test.tsx
    - app/library/[id]/PaperReader.tsx
    - app/library/[id]/PaperReader.test.tsx
    - components/PaperList.tsx
    - components/PaperList.test.tsx
    - app/globals.css
