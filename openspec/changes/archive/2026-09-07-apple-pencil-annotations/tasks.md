## 1. 資料層

- [x] [P] 1.1 在 `lib/supabase/schema.sql` 新增 `alter table notes add column if not exists strokes jsonb;` 遷移敘述,執行後 `notes` 表可儲存畫記的向量筆跡陣列,驗證方式:於 Supabase SQL Editor 執行遷移後,手動 insert 一筆含 `strokes` 欄位的測試資料並成功讀回,確認欄位型別為 jsonb(對應設計決策「延伸既有 notes 資料表,而非新增獨立資料表」)
- [x] [P] 1.2 建立 `lib/annotations/stroke-geometry.ts`,實作 `normalizePoint(pixelPoint, pageWidth, pageHeight)` 與 `denormalizePoint(normalizedPoint, pageWidth, pageHeight)` 兩個純函式,給定像素座標與頁面尺寸可正確轉換為 0~1 比例座標並可還原,驗證方式:單元測試涵蓋設計文件 Example 表格中的兩組座標(如 800x600 頁面下的 (400,300) 正規化為 (0.5,0.5),再於 600x450 頁面還原為 (300,225)),`npx vitest run lib/annotations/stroke-geometry.test.ts` 全數通過(對應設計決策「座標以相對頁面比例(0~1)正規化儲存,而非像素絕對座標」,對應 Requirement: Cross-Device Coordinate Alignment)
- [x] 1.3 建立 `lib/annotations/queries.ts`,實作 `createStrokeNote(supabase, { paperId, pageNumber, strokes })`,`user_id` 一律由 `supabase.auth.getUser()` 推導、函式簽章不接受呼叫端傳入 `user_id`,且寫入時 `note_text` 為 null、`strokes` 欄位填入傳入的筆跡陣列,驗證方式:單元測試以兩個不同模擬使用者 session 呼叫,確認各自寫入的 `user_id` 對應各自的登入者且從不互相污染(比照 `lib/papers/queries.test.ts` 的測試模式),並確認未帶任何點的空筆記(`strokes` 為空陣列)呼叫時不會觸發 insert(對應 Requirement: Stroke Capture and Persistence、Mutually Exclusive Note Content)

## 2. 畫布元件

- [x] 2.1 建立 `components/AnnotationCanvas.tsx`,提供一個可疊加在 PDF 頁面上的畫布,接收既有筆跡陣列(`strokes`)並渲染,同時在啟用狀態下捕捉指標事件(pointerdown/pointermove/pointerup)組成新的筆跡、透過 `lib/annotations/stroke-geometry.ts` 正規化座標後,以 `onStrokeComplete(strokes)` callback 回傳給呼叫端(筆跡以座標點陣列儲存,不將畫布轉成點陣圖片),驗證方式:單元測試模擬一系列 pointer 事件,確認 `onStrokeComplete` 收到的是筆跡點座標陣列(而非圖片資料),且座標已正規化為 0~1 範圍;另外測試「未拖曳的單一 pointerdown+pointerup」不會觸發 `onStrokeComplete`(對應 Requirement: Stroke Capture and Persistence,對應設計決策「畫記儲存為向量筆跡資料,而非點陣圖片」)
- [x] 2.2 修改 `components/PdfViewer.tsx`,加入「畫筆模式」切換按鈕,開啟時渲染 `AnnotationCanvas` 疊加在目前頁面上並暫停既有的 selectionchange 文字選取偵測,關閉時移除畫布並恢復原本的選字/翻頁行為,驗證方式:單元測試確認畫筆模式關閉時畫布不掛載、切換開啟後畫布掛載;確認畫筆模式開啟時 `onTextSelected` 不會因頁面上的指標操作被觸發(對應 Requirement: Pen Mode Toggle,對應設計決策「明確的「畫筆模式」切換按鈕,而非自動偵測輸入來源」)

## 3. 整合與顯示

- [x] [P] 3.1 修改 `app/library/[id]/PaperReader.tsx`,串接 `AnnotationCanvas` 的 `onStrokeComplete` 呼叫 `lib/annotations/queries.ts#createStrokeNote` 儲存畫記,成功後立即將新筆記加入畫面上的筆記狀態(不需重新整理頁面即可看到剛畫的筆跡),並將目前頁面既有的畫記筆記(從 `initialNotes` 篩選出對應頁碼、`strokes` 不為 null 的筆記)傳入 `AnnotationCanvas` 顯示,驗證方式:單元測試模擬 `AnnotationCanvas` 觸發 `onStrokeComplete`,確認 `createStrokeNote` 被正確呼叫且回傳的筆記出現在畫面狀態中(對應 Requirement: Stroke Capture and Persistence)
- [x] [P] 3.2 修改 `components/NoteList.tsx`,當筆記為畫記類型(`strokes` 不為 null、`note_text` 為 null)時,顯示「(手寫畫記)」取代原本嘗試渲染空白文字內容,驗證方式:單元測試傳入一筆 `strokes` 不為 null 的筆記,確認清單項目顯示「(手寫畫記)」而非空白或錯誤(對應 Requirement: Mutually Exclusive Note Content)
