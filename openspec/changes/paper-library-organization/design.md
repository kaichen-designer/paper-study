## Context

論文庫（components/PaperList.tsx 與 app/library/page.tsx）目前把 listPapers 回傳的論文以單一平面清單呈現。論文列只能新增與讀取：沒有改名、沒有移除，也沒有任何排序或分組的依據。

`papers` 表已經有三個與閱讀進度相關的欄位：`reached_last_page`（翻到最後一頁時自動設定）、`finished_reading`（使用者在閱讀頁手動標記）、`finished_at`。也就是說「讀完了」這個概念已經存在，只是沒有出現在論文庫裡。

RLS 政策 papers_update_own 與 papers_delete_own 已經允許擁有者更新與刪除自己的論文列，Storage 也已有對應的刪除政策。因此改名與刪除缺的是查詢函式與介面，不是權限。

約束：使用者已明確選擇階段**完全手動**切換，以及刪除採**軟刪除**可還原。

## Goals / Non-Goals

**Goals:**

- 論文標題可以在論文庫中改名。
- 論文可以移出論文庫且可還原，永久刪除為獨立且明確的第二步。
- 論文有三個閱讀階段，論文庫依階段分組。
- 階段與既有的 `finished_reading` / `finished_at` 永不矛盾。

**Non-Goals:**

- 不改變 `reached_last_page` 的既有行為（仍由翻頁自動設定），它不參與階段判定。
- 不觸碰 `imported_to_detabase`。
- 不做自動推進階段。使用者已明確排除這個選項。
- 不做回收筒的自動清空或保留期限。永久刪除一律由使用者發動。
- 不做排序、搜尋、標籤或自訂分類。本次只有三個固定階段。
- 不做批次操作（多選改名、多選刪除）。

## Decisions

### 閱讀階段以 reading_stage 為單一事實來源

新增 `reading_stage` 欄位，型別為 text 並加上 check 約束，值域為 `up_next`、`reading`、`finished`，預設 `up_next`。

`finished_reading` 與 `finished_at` **保留不動**，但不再有第二個寫入者。所有階段變更一律經過 lib/papers/reading-stage.ts 匯出的單一函式 setReadingStage，由它同時寫入 `reading_stage`、`finished_reading`、`finished_at`：

- 切換到 `finished`：`reading_stage = 'finished'`、`finished_reading = true`、`finished_at = now()`（若原本為 null）。
- 從 `finished` 切換離開：`reading_stage` 設為新值、`finished_reading = false`、`finished_at = null`。

閱讀頁既有的「標記為讀完」流程改為呼叫同一個函式，而不是直接寫 `finished_reading`。

替代方案與否決理由：

- **只用既有的 `finished_reading` 加一個布林欄位區分另外兩階段**：兩個布林可以組合出四種狀態，其中一種無意義，需要額外的不變式去維護。三值欄位直接讓非法狀態無法表示。
- **完全移除 `finished_reading`，改由 `reading_stage` 推導**：需要同時改動 finished-reading-tracking 既有的規格、查詢與測試，範圍遠超本次需求，且沒有帶來新的使用者價值。
- **兩邊各自寫入、以資料庫觸發器同步**：把不變式藏進資料庫，本地測試看不到，偵錯成本高。

### 軟刪除使用 deleted_at 時間戳

新增 `deleted_at timestamptz`，預設 null。非 null 即代表已移入回收筒。

用時間戳而非布林，是因為它同時回答「是否已刪除」與「何時刪除的」。回收筒可依刪除時間排序，日後若要加保留期限也不需要再改結構。

listPapers 一律附加 `deleted_at is null`；新增 listDeletedPapers 只取 `deleted_at is not null`，依 `deleted_at` 由新到舊排序。

### 回收筒是論文庫的切換而非獨立路由

回收筒以論文庫頁面內的切換呈現，不另開路由。理由是回收筒是低頻、短暫停留的介面，獨立頁面會多出導覽、返回與空狀態三份額外設計，而它們對這個規模的功能沒有回報。

### 永久刪除先刪資料列再刪 Storage 檔案

順序固定為：先刪 `papers` 資料列（筆記、畫記、反思對話由既有的 `on delete cascade` 連帶移除），成功後再以 best-effort 刪除 Storage 中的 PDF 物件。Storage 刪除失敗不會讓整個操作失敗。

權衡：這個順序可能留下孤兒檔案（浪費空間，但不影響任何畫面）。相反順序若在刪除資料列時失敗，會留下一筆指向不存在檔案的論文——使用者會在論文庫看到一篇打不開的論文。可稽核的浪費優於壞掉的狀態。

### 階段切換完全手動

上傳後一律為 `up_next`。開啟論文、翻到最後一頁都不會改變階段。

理由：使用者明確選擇了這個行為。自動推進會讓「隨手點開一篇確認是不是要找的那篇」這個動作意外改變分類，而分類的價值正來自它反映使用者的意圖而非瀏覽軌跡。

## Implementation Contract

**資料結構**

- `papers.reading_stage`：text、not null、default `'up_next'`、check 值域為三者之一。既有資料列的回填規則：`finished_reading = true` 者填 `'finished'`，其餘填 `'up_next'`。
- `papers.deleted_at`：timestamptz、nullable、預設 null。
- 新增索引涵蓋 `user_id` 與 `deleted_at`，供論文庫與回收筒兩種查詢使用。

**查詢介面**（lib/papers/queries.ts 與 lib/papers/reading-stage.ts）

- `renamePaper(supabase, paperId, title)`：更新標題。標題前後空白會被修剪；修剪後為空字串則拋出錯誤且不寫入。
- `setReadingStage(supabase, paperId, stage)`：唯一的階段寫入點，行為如上述決策所述。傳入非法值時拋出錯誤。
- `softDeletePaper(supabase, paperId)`：設定 `deleted_at = now()`。
- `restorePaper(supabase, paperId)`：設定 `deleted_at = null`。還原後階段維持刪除前的值。
- `purgePaper(supabase, paperId)`：刪除資料列，再 best-effort 刪除 Storage 物件。
- `listPapers` 排除已刪除者；`listDeletedPapers` 只回傳已刪除者。

所有函式一律不接受 `user_id` 參數，擁有者範圍由 RLS 強制，與 lib/papers/queries.ts 既有的做法一致。

**可觀察行為**

- 論文庫依三個階段分組顯示，每組標題為「正在讀」「接下來要讀」「讀完了」。空的分組不顯示。
- 每張論文卡片提供改名、切換階段、移至回收筒三個操作。
- 回收筒切換開啟後顯示已刪除的論文，每張提供還原與永久刪除。
- 永久刪除前顯示確認，確認文字明確說明會一併刪除幾筆筆記與畫記，且不可復原。
- 軟刪除不需要確認，因為它可還原。

**驗收標準**

- lib/papers/reading-stage.test.ts 涵蓋：切換到 finished 會一併設定 `finished_reading` 與 `finished_at`；從 finished 切離會清除兩者；非法值拋錯。
- lib/papers/queries.test.ts 涵蓋：listPapers 的查詢包含 `deleted_at is null` 條件；listDeletedPapers 只取已刪除者；renamePaper 拒絕空白標題；purgePaper 在 Storage 刪除失敗時仍視為成功。
- components/PaperList.test.tsx 涵蓋：依階段分組、空分組不顯示、回收筒切換會改變顯示的清單。
- app/library/[id]/PaperReader.test.tsx 涵蓋：既有的「標記為讀完」流程會寫入 `reading_stage`。

**範圍邊界**

- 在範圍內：papers 表結構、lib/papers 下的查詢、論文庫介面、閱讀頁標記讀完的寫入路徑。
- 在範圍外：notes、reflection_messages、translation_cache 的結構與查詢；上傳流程；PDF 閱讀與畫記；`reached_last_page` 的設定時機。

## Risks / Trade-offs

- [既有資料列沒有 `reading_stage`，回填錯誤會讓論文出現在錯的分組] → 回填規則只依賴 `finished_reading`，語意明確；且階段可由使用者手動更正，不會造成資料遺失。
- [永久刪除後 Storage 物件殘留] → 已是刻意選擇的權衡（見決策）。殘留檔案不影響任何畫面，且可日後以獨立的清理工作處理。
- [軟刪除的論文仍佔用 Storage 空間] → 這正是可還原的代價。使用者可隨時永久刪除以釋出空間。
- [`finished_reading` 有兩處來源（論文庫與閱讀頁）] → 兩處都改為呼叫 setReadingStage，單一寫入點是本次的核心不變式；測試會同時覆蓋這兩條路徑。

## Migration Plan

1. 在 lib/supabase/schema.sql 加入兩個欄位、check 約束與索引，皆使用 if not exists 形式，維持既有檔案可重複執行的特性。
2. 回填既有資料列的 `reading_stage`。
3. 於 Supabase SQL editor 套用。schema.sql 是本專案既有的結構管理方式，沿用不另建 migration 機制。

回滾：兩個欄位都可直接 drop，不影響既有欄位與資料。`finished_reading` 與 `finished_at` 全程未被改變語意，因此回滾後既有功能完全不受影響。

## Open Questions

（無。階段切換方式與刪除語意已由使用者明確決定。）
