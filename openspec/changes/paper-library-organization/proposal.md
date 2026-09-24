## Why

論文庫目前只能上傳與開啟。論文一旦存進去，標題就固定了（標題取自上傳當下的檔名，經常不是可讀的名稱），而且沒有任何移除的方式——誤傳或不再需要的論文會永久佔據論文庫。

同時，論文庫是一份不分先後的平面清單。使用者實際的閱讀流程有階段之分：有些正在讀、有些讀完了、有些是排隊等著讀。目前這個資訊只存在使用者腦中，論文一多就無法維持。

`papers` 表已經有 `finished_reading` 與 `finished_at`，所以「讀完了」這個狀態已經存在一半了。這次要補的是另外兩個階段，並且**不能**做出第二套與既有欄位並存、可能互相矛盾的狀態。

## What Changes

- 新增重新命名論文標題的功能。
- 新增刪除論文的功能，採**軟刪除**：論文移出論文庫但資料保留，可以還原。論文庫加入回收筒切換，可在其中還原或永久刪除。
- 永久刪除時一併移除 Storage 中的 PDF 檔案。筆記、畫記、反思對話本來就會由既有的 `on delete cascade` 連帶移除。
- 新增閱讀階段：`up_next`（接下來要讀）、`reading`（正在讀）、`finished`（讀完了）。上傳後預設為 `up_next`。
- 階段**完全手動**切換。系統不會因為開啟論文或讀到最後一頁而自動推進階段。
- 論文庫依階段分組顯示。
- 階段與既有的 `finished_reading` / `finished_at` 由**單一寫入點**同步，避免兩套狀態各自為政。閱讀頁既有的「標記為讀完」流程改為走同一個寫入點。

## Non-Goals

（本變更會建立 design.md，範圍界定寫在該處的 Goals / Non-Goals。）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `paper-library`: 新增論文標題重新命名、軟刪除與還原、永久刪除、閱讀階段的設定與分組顯示等需求。

## Impact

- Affected specs: `paper-library`
- Affected code:
  - New:
    - components/PaperCard.tsx
    - components/PaperCard.test.tsx
    - components/TrashToggle.tsx
    - components/TrashToggle.test.tsx
    - lib/papers/reading-stage.ts
    - lib/papers/reading-stage.test.ts
  - Modified:
    - lib/supabase/schema.sql
    - lib/papers/queries.ts
    - lib/papers/queries.test.ts
    - components/PaperList.tsx
    - components/PaperList.test.tsx
    - app/library/page.tsx
    - app/library/[id]/PaperReader.tsx
    - app/library/[id]/PaperReader.test.tsx
    - app/globals.css
  - Removed: （無）
