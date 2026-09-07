## Context

`pencil-annotations`(已併入 baseline)目前的實作是:每完成一筆拖曳(drag)就呼叫一次 `createStrokeNote`,寫入一筆只含單一 stroke 的 `notes` 記錄(`note.strokes = [oneStroke]`)。`PaperReader.tsx` 讀取時把當頁所有 note 的 strokes `flatMap` 成一個扁平陣列丟給 `PdfViewer`/`AnnotationCanvas` 渲染。`notes.strokes` 是 `jsonb` 欄位,新增 `color`/`width` 屬性不需要資料庫遷移。`notes` 表已有 `notes_delete_own` RLS policy(`auth.uid() = user_id`),刪除功能不需要新增 SQL。

## Goals / Non-Goals

**Goals:**

- 畫筆模式新增工具列:筆刷/橡皮擦切換、顏色選擇(固定調色盤)、粗細選擇(固定幾種寬度)。
- 每筆新畫的線記錄當時選擇的顏色與粗細,存進 `notes.strokes[].color` / `notes.strokes[].width`,重新整理後正確還原。
- 橡皮擦以整筆線為單位刪除:偵測到擦除路徑與某筆既有 stroke 相交時,刪除該 stroke 所屬的 note 記錄。

**Non-Goals:**

- 不做像素級局部擦除(擦掉一條線的其中一段、留下其餘部分)——目前每個 note 記錄對應恰好一筆 stroke(`One Stroke Per Note Record` 這個既有寫入模式不變),整筆刪除即等於刪除該 note。
- 不做自訂顏色(色輪/色碼輸入)——固定調色盤即可。
- 不跨 session(重新整理頁面/重新開啟 App)記住使用者上次選的顏色/粗細,每次進入畫筆模式重置為預設值。
- 不做復原/重做(undo/redo)。

## Decisions

### One Stroke Per Note Record 的擦除語意

沿用既有寫入模式(每筆 stroke 各自是一筆獨立的 note 記錄),擦除的最小單位就是「刪除一筆 note」,不需要處理「一筆 note 內多個 strokes,只刪除其中一個」的部分刪除邏輯。`AnnotationCanvas` 仍然只接收扁平化的 `strokes` 陣列(不知道 note id),擦除的識別改用陣列 index:新增 `onEraseStroke(index: number)` callback,回報「使用者擦掉了目前 `strokes` 陣列裡第幾筆」,由呼叫方(`PdfViewer` → `PaperReader`)自行對應回該 index 屬於哪個 note id 並呼叫刪除。

### 橡皮擦命中判定(Stroke Hit-Testing)

新增 `lib/annotations/stroke-hit-test.ts`,提供純函式 `doesEraserPathIntersectStroke(eraserPoints, stroke, eraserRadius)`:對橡皮擦路徑上每個取樣點,計算它與該 stroke 每個線段(相鄰兩點連線)的最短距離,只要有任一距離小於 `eraserRadius + stroke.width / 2`,即視為相交。放在 `lib/` 而非 `AnnotationCanvas.tsx` 內,以便獨立單元測試幾何判定邏輯,不必透過模擬 pointer 事件間接驗證。

### AnnotationCanvas 的工具狀態來源

`AnnotationCanvas` 新增三個 props:`tool: "pen" | "eraser"`、`strokeColor: string`、`strokeWidth: number`,由 `PdfViewer` 向上交給 `AnnotationToolbar` 管理的 state 決定,`AnnotationCanvas` 本身不擁有工具狀態(維持現有「畫布只管畫,不管工具選擇」的分工)。`pointermove` 時依 `tool` 分流:`pen` 沿用現有畫線邏輯;`eraser` 則把目前移動路徑上的取樣點逐一丟給 `doesEraserPathIntersectStroke` 檢查所有既有 `strokes`,一旦命中立即呼叫 `onEraseStroke(index)`(即時擦除,不需等 pointerup)。

### AnnotationToolbar 元件與版面配置

新增 `components/AnnotationToolbar.tsx`,只在 `penMode` 為 true 時渲染於 `pdf-viewer-controls` 上方(取代目前的 `pen-mode-hint` 文字提示位置)。內容:一組固定色票 button(例如紅/藍/黑/綠,以 `data-color` 屬性標記目前選取)、一組固定粗細 button(細/中/粗,對應 `2/4/8` px)、筆刷/橡皮擦切換 button。狀態(`tool`/`color`/`width`)由 `PdfViewer` 用 `useState` 持有並在每次進入畫筆模式(`penMode` 從 false 變 true)時重置為預設值(筆刷、紅色、中等粗細),對應 Non-Goals 的「不跨 session 記住」決策。

### Stroke 型別擴充與舊資料相容

`lib/annotations/stroke-geometry.ts` 的 `Stroke` 型別擴充為 `{ points: Point[]; color?: string; width?: number }`,兩個新欄位皆為 optional。`AnnotationCanvas` 渲染既有 strokes 時,`color` 缺省時 fallback 為目前預設色(紅色 `#e63946`,與既有寫死的顏色一致),`width` 缺省時 fallback 為 `2`(既有寫死的 `strokeWidth`),確保 apple-pencil-annotations 階段已存的舊資料(沒有 color/width 欄位)仍能正常顯示,不需要資料回填(backfill)。

## Implementation Contract

**行為(使用者可觀察到的):**

- 進入畫筆模式後,工具列可見,預設選中「筆刷」「紅色」「中等粗細」。
- 切換顏色/粗細後,接下來畫的新線條套用該顏色/粗細;已經畫好的舊線條顏色/粗細不變。
- 切換到「橡皮擦」後,手指/Apple Pencil 在畫面上劃過任何一筆既有線條時,該線條立即消失(不需要放開手指或額外確認)。
- 重新整理頁面後,所有線條的顏色/粗細與擦除結果都正確保留(擦掉的線條不再出現,未擦的線條顏色/粗細與畫的時候一致)。

**介面/資料形狀:**

- `Stroke = { points: Point[]; color?: string; width?: number }`(`lib/annotations/stroke-geometry.ts` 匯出的型別,`lib/annotations/queries.ts` re-export)。
- `AnnotationCanvas` props 新增:`tool: "pen" | "eraser"`、`strokeColor: string`、`strokeWidth: number`、`onEraseStroke: (index: number) => void`。
- `doesEraserPathIntersectStroke(eraserPoints: Point[], stroke: Stroke, eraserRadius: number): boolean`(`lib/annotations/stroke-hit-test.ts`)。
- `lib/annotations/queries.ts` 新增 `deleteStrokeNote(supabase, noteId: string): Promise<void>`,比照 `createStrokeNote` 的存取模式:不接受 `userId` 參數,單純呼叫 `.delete().eq("id", noteId)`,實際的擁有權限制交給既有的 `notes_delete_own` RLS policy 執行(未擁有該筆記錄的請求會被資料庫拒絕,而不是在應用層檢查)。

**失敗模式:**

- `deleteStrokeNote` 若刪除失敗(網路錯誤、RLS 拒絕），拋出 `Error`,呼叫方(`PaperReader.handleEraseStroke`)捕捉後保留該筆記錄在畫面上(不樂觀移除),避免 UI 顯示已刪除但實際上資料庫仍存在的不一致狀態。
- 橡皮擦命中判定找不到任何相交的 stroke 時,`onEraseStroke` 不被呼叫,沒有任何副作用。

**驗收標準:**

- `lib/annotations/stroke-hit-test.test.ts`:涵蓋「橡皮擦路徑與線段距離小於門檻視為相交」「距離大於門檻不相交」「stroke.width 越粗,判定門檻越寬」三種情境的單元測試。
- `components/AnnotationCanvas.test.tsx`:新增「eraser 工具下,pointermove 掃過既有 stroke 時呼叫 onEraseStroke 並帶正確 index」「pen 工具下 pointermove 不觸發 onEraseStroke」「新畫的 stroke 帶有目前傳入的 strokeColor/strokeWidth」測試。
- `components/AnnotationToolbar.test.tsx`:涵蓋顏色/粗細/工具切換的點擊行為與目前選取狀態的視覺標記(如 `aria-pressed`)。
- `app/library/[id]/PaperReader.test.tsx`:新增「onEraseStroke 觸發時呼叫 deleteStrokeNote 並把該筆記錄從畫面移除」「deleteStrokeNote 失敗時該筆記錄保留在畫面上」測試。

**範圍邊界:**

- 範圍內:工具列 UI、顏色/粗細狀態管理、stroke 資料結構擴充、橡皮擦命中判定與刪除、既有舊資料的顯示相容。
- 範圍外:自訂顏色輸入、跨 session 記住工具偏好、undo/redo、部分擦除(只擦一段線)、`notes` 資料表 schema 遷移(沿用既有 `strokes jsonb` 欄位)。

## Risks / Trade-offs

- [風險] 橡皮擦即時擦除(pointermove 觸發、非 pointerup 才確認)可能因為手指移動快、取樣點稀疏而「跳過」細線,擦不乾淨 → [因應] `eraserRadius` 判定門檻加上固定的容錯值(不是只用像素點對點距離),且 pointermove 事件密度已足以覆蓋一般繪圖速度下的手勢。
- [風險] 每個 stroke 對應一筆獨立 note 記錄,若使用者一次畫很多筆再一次擦除多筆,會產生多次個別的 DELETE 請求(非 batch) → [因應] 目前使用情境是單人個人使用、單頁筆記數量少(幾十筆內),效能影響可忽略,不做批次化。

