## Context

`components/PdfViewer.tsx` 已經用 react-pdf 渲染 PDF 頁面,並透過 `window.getSelection()` 偵測文字選取(用於翻譯功能)。`notes` 資料表(schema.sql)已存在,欄位為 `id, paper_id, user_id, page_number, position, selected_text, note_text, created_at`,並有以 `auth.uid() = user_id` 為範圍的 RLS 政策(`notes_select_own`、`notes_insert_own` 等)。本次變更要在既有頁面渲染上疊加一層可畫記的畫布,並重用既有的 notes 資料表與存取模式。

## Goals / Non-Goals

**Goals:**

- 在 PDF 頁面上疊加畫布,支援 Apple Pencil(與觸控)手寫畫記
- 畫記以向量座標資料儲存,縮放後仍正確對齊頁面內容
- 畫記綁定論文與頁碼,跨裝置讀取到相同內容
- 重用既有 notes 資料表的存取模式(user_id 由 `auth.getUser()` 推導,不接受呼叫端傳入)

**Non-Goals:**

- 不做手寫辨識(OCR),畫記不會被轉成可搜尋文字
- 不支援同一則筆記混合文字與畫記(v1 一則筆記只能是純文字或純畫記其中一種)
- 不做自動偵測輸入來源(手指 vs Apple Pencil)來切換模式,一律由使用者手動切換畫筆模式
- 不做畫布筆跡的多人協作或即時同步顯示(單一使用者個人使用)

## Decisions

### 畫記儲存為向量筆跡資料,而非點陣圖片

每筆畫記(stroke)是一串座標點(每個點含 x、y、可選的壓感 pressure),而不是把整個畫布轉成 PNG 存檔。向量資料檔案小很多,且未來若要調整畫筆顏色/粗細或重新渲染在不同解析度下都不會失真;點陣圖片一旦存下就無法再編輯或無失真縮放。

### 座標以相對頁面比例(0~1)正規化儲存,而非像素絕對座標

PDF 頁面渲染尺寸會因裝置螢幕寬度、使用者是否縮放而不同(例如同一頁在桌機瀏覽器渲染成 800px 寬,在 iPad 上可能是 600px 寬)。若儲存像素絕對座標,換一個渲染尺寸畫記位置就會跑掉。正規化成頁面寬高的比例(0~1 區間),渲染時再乘上當下的實際頁面尺寸還原座標,確保畫記永遠對齊原本標記的內容。

### 明確的「畫筆模式」切換按鈕,而非自動偵測輸入來源

雖然瀏覽器的 Pointer Events API 可以透過 `event.pointerType === 'pen'` 判斷是否為 Apple Pencil 輸入,藉此自動切換手指滾動 vs 畫筆繪圖,但這樣的自動判斷在手指誤觸、或使用者想用手指畫記時會造成混淆。改為畫面上明確的「畫筆模式」切換按鈕:開啟後,畫布會攔截所有指標事件用於繪圖,同時暫停頁面本身的觸控捲動/縮放;關閉後畫布不攔截事件,恢復正常閱讀/選字/翻頁操作。此決策已與使用者確認(見對應的 spectra-discuss 記錄)。

### 延伸既有 notes 資料表,而非新增獨立資料表

新增一個 `strokes` jsonb 欄位到 `notes` 表(存放該則筆記的筆跡陣列),而不是另開一張 `annotations` 或 `drawings` 表。理由:畫記在概念上就是「使用者對某頁記錄的一則筆記」,只是內容型態不同(向量筆跡而非文字);沿用同一張表可以直接重用既有的 RLS 政策、查詢模式(`lib/notes/queries.ts` 的 `createNote`/`listNotesForPaper`)與跨裝置同步機制,不需要重新設計一套平行的存取層。`note_text` 與 `strokes` 兩欄位互斥:一則筆記只會填其中一欄,由呼叫端保證(見下方 Implementation Contract)。

## Implementation Contract

**行為(使用者可觀察到的結果):**
- PDF 閱讀畫面上有一個「畫筆模式」切換按鈕;點擊後畫布疊加在當前頁面上,使用者可用 Apple Pencil 或手指在頁面上畫線
- 開啟畫筆模式時,原本的手指滑動翻頁/縮放/文字選取行為暫停;再次點擊按鈕關閉畫筆模式後恢復
- 使用者畫完後(例如放開觸控/點選「儲存畫記」),畫記以一則新筆記的形式儲存,並立即顯示在該頁面上(不需重新整理頁面)
- 重新整理頁面、或以同帳號在另一裝置開啟同一篇論文同一頁,先前畫的筆跡會依相同相對位置正確顯示
- 頁面縮放或在不同螢幕寬度的裝置開啟時,已儲存的筆跡仍對齊到原本標記的內容位置(而非跑位或超出頁面範圍)

**介面/資料形狀:**
- `notes` 表新增欄位:`strokes jsonb`,格式為 `Stroke[]`,其中 `Stroke = { points: { x: number; y: number; pressure?: number }[] }`,`x`/`y` 為相對頁面寬高的 0~1 比例座標
- `note_text` 與 `strokes` 為互斥欄位:純文字筆記時 `strokes` 為 null;畫記筆記時 `note_text` 為 null,`strokes` 不為 null 且至少包含一筆 stroke
- `lib/annotations/queries.ts` 提供 `createStrokeNote(supabase, { paperId, pageNumber, strokes })`,比照 `lib/notes/queries.ts#createNote` 的模式:`user_id` 一律由 `supabase.auth.getUser()` 推導,函式簽章中不存在可由呼叫端傳入 `user_id` 的參數
- `lib/annotations/stroke-geometry.ts` 提供座標正規化/還原的純函式(例如 `normalizePoint(pixelPoint, pageWidth, pageHeight)` 與 `denormalizePoint(normalizedPoint, pageWidth, pageHeight)`),不依賴瀏覽器或 Supabase,可獨立單元測試

**失敗模式:**
- 若使用者在未開啟畫筆模式時嘗試繪圖,畫布不攔截任何指標事件,行為等同畫筆模式不存在(不會出現任何錯誤或殘留筆跡)
- 若儲存筆記到 Supabase 失敗(網路錯誤、RLS 拒絕等),畫面顯示明確錯誤訊息,且不清除使用者剛畫好、尚未儲存成功的筆跡(避免手寫內容遺失)
- 若一筆畫記的 `points` 陣列為空(使用者點擊但未拖曳),不建立空白筆記記錄

**驗收標準:**
- 單元測試涵蓋 `lib/annotations/stroke-geometry.ts` 的正規化/還原邏輯(給定像素座標與頁面尺寸,驗證轉換後再還原能得到原始像素座標,或在合理誤差範圍內)
- 單元測試涵蓋 `lib/annotations/queries.ts#createStrokeNote` 的 user_id 推導邏輯(比照 `lib/papers/queries.test.ts` 的兩使用者情境測試模式)
- 手動於實體 iPad 搭配 Apple Pencil 驗證:開啟畫筆模式畫線、關閉後確認可正常滑動翻頁、重新整理頁面確認筆跡仍在原位置

**範圍邊界:**
- 範圍內:單頁畫記的建立、儲存、顯示、座標正規化與跨裝置讀取
- 範圍外:手寫辨識/OCR、筆記文字與畫記混合、跨頁連續畫記、畫筆顏色/粗細自訂 UI(v1 用單一預設樣式)、復原/重做(undo/redo)

## Risks / Trade-offs

- [不同瀏覽器/裝置對 Pointer Events 的壓感支援不一致(部分瀏覽器 `pressure` 恆為 0.5)] → 壓感僅作為畫筆粗細的加分呈現,即使壓感資料不可靠,筆跡本身(座標點)仍完整可用,不影響核心功能
- [畫筆模式攔截觸控事件時,若實作不當可能連翻頁按鈕等 UI 元件都被誤攔截] → 畫布只疊加在 PDF 頁面渲染區域內,翻頁控制項(`pdf-viewer-controls`)在畫布範圍外,不受畫筆模式影響
- [正規化座標的頁面尺寸基準(儲存當下的頁面寬高)與日後讀取時的頁面寬高必須一致換算,若換算邏輯有誤會導致筆跡位移] → 用 `lib/annotations/stroke-geometry.ts` 的單元測試鎖定正規化/還原邏輯的正確性,避免此類邏輯錯誤

## Migration Plan

在 Supabase SQL Editor 執行一段 `alter table notes add column if not exists strokes jsonb;` 的遷移(附加到 `lib/supabase/schema.sql`)。既有的 `notes_select_own`/`notes_insert_own` 等 RLS 政策以 `user_id` 欄位為範圍,新增欄位不影響現有政策,不需要重新設定權限。既有的純文字筆記資料不受影響(`strokes` 欄位對舊資料一律為 null)。
