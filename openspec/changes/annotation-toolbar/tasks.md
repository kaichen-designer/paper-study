## 1. Stroke 資料模型與命中判定(基礎、彼此獨立的檔案)

- [x] [P] 1.1 擴充 lib/annotations/stroke-geometry.ts 的 `Stroke` 型別,新增 optional 的 `color`/`width` 欄位(對應設計決策「Stroke 型別擴充與舊資料相容」);驗證方式:`npm run build` 通過,且既有引用 `Stroke` 型別的 components/AnnotationCanvas.tsx、app/library/[id]/PaperReader.tsx 不需修改型別標註即可編譯成功
- [x] [P] 1.2 在新檔案 lib/annotations/stroke-hit-test.ts 實作 `doesEraserPathIntersectStroke(eraserPoints, stroke, eraserRadius)`:當橡皮擦路徑上任一取樣點與 stroke 任一線段的最短距離小於 `eraserRadius + stroke.width / 2` 時回傳 true(對應設計決策「橡皮擦命中判定(Stroke Hit-Testing)」與 spec 的 Whole-Stroke Erasing 需求);驗證方式:新增 lib/annotations/stroke-hit-test.test.ts,涵蓋「距離小於門檻視為相交」「距離大於門檻不相交」「同樣距離下,較粗的 stroke.width 判定相交、較細的不相交」三個測試案例(對應 design.md 的 eraser hit-test threshold 範例表)
- [x] [P] 1.3 在 lib/annotations/queries.ts 新增 `deleteStrokeNote(supabase, noteId: string)`:刪除 `notes` 表中指定 id 的記錄,不接受 `userId` 參數(擁有權限制交給既有 `notes_delete_own` RLS policy),失敗時拋出 Error;驗證方式:在 lib/annotations/queries.test.ts 新增測試,斷言呼叫了 `.from("notes").delete().eq("id", noteId)`,以及 Supabase client 回傳錯誤時會 reject

## 2. AnnotationCanvas:工具、顏色、粗細、橡皮擦

- [x] 2.1 為 AnnotationCanvas 新增 `strokeColor`/`strokeWidth` props,套用到新畫的線條上,使 `onStrokeComplete` 回報的 stroke 物件包含目前選取的顏色與粗細(對應 spec 的 Stroke Color Selection 與 Stroke Width Selection 需求);驗證方式:components/AnnotationCanvas.test.tsx 新增測試,斷言完成一筆拖曳後回報的 stroke 帶有傳入的 strokeColor/strokeWidth
- [x] 2.2 既有 strokes 依各自的 `color`/`width` 渲染,當某筆 stroke 缺少這兩個欄位時(舊資料)fallback 為目前預設顏色(`#e63946`)與寬度(`2`)(對應設計決策「Stroke 型別擴充與舊資料相容」與 spec 的 Cross-Device Coordinate Alignment 需求);驗證方式:components/AnnotationCanvas.test.tsx 新增兩個測試——一個渲染沒有 color/width 的 stroke,斷言 polyline 的 stroke/stroke-width 屬性等於預設值;另一個渲染有明確 color/width 的 stroke,斷言使用該值而非預設值
- [x] 2.3 新增 `tool: "pen" | "eraser"` prop;當 `tool === "eraser"` 時,拖曳不再畫出新線條,而是把移動路徑上的取樣點逐一丟給 lib/annotations/stroke-hit-test.ts 的 `doesEraserPathIntersectStroke` 檢查 `strokes` prop 中的每一筆,一旦命中就呼叫新的 `onEraseStroke(index)` callback(對應設計決策「AnnotationCanvas 的工具狀態來源」與 spec 的 Tool Selection、Whole-Stroke Erasing 需求);驗證方式:components/AnnotationCanvas.test.tsx 新增三個測試——(a) `tool="eraser"` 時拖曳劃過既有 stroke 會以正確 index 呼叫 onEraseStroke,(b) `tool="eraser"` 時不會有新 stroke 被加入 onStrokeComplete 回報,(c) `tool="pen"` 時拖曳絕不呼叫 onEraseStroke

## 3. AnnotationToolbar 元件

- [x] 3.1 建立 components/AnnotationToolbar.tsx,渲染筆刷/橡皮擦切換、固定色票、固定粗細選項,點擊時分別呼叫 `onToolChange`/`onColorChange`/`onWidthChange`,並在目前選取的選項上標記 `aria-pressed="true"`(對應設計決策「AnnotationToolbar 元件與版面配置」與 spec 的 Tool Selection、Stroke Color Selection、Stroke Width Selection 需求);驗證方式:新增 components/AnnotationToolbar.test.tsx,斷言點擊各個控制項會以正確的值呼叫對應 callback,且 `aria-pressed="true"` 會轉移到剛點擊的按鈕上

## 4. PdfViewer 整合

- [x] 4.1 在 PdfViewer 新增工具列狀態(`tool`、`strokeColor`、`strokeWidth`),只在 `penMode` 為 true 時掛載 AnnotationToolbar,並在每次 `penMode` 從 false 轉為 true 時把狀態重置為預設值(筆刷、紅色、中等粗細),再把狀態與 `onEraseStroke` 傳給 AnnotationCanvas(對應設計決策「AnnotationToolbar 元件與版面配置」);驗證方式:components/PdfViewer.test.tsx 新增測試——(a) 非畫筆模式下不渲染工具列,(b) 在工具列切換顏色會改變傳給 AnnotationCanvas 的 strokeColor,(c) 先切到橡皮擦、關閉畫筆模式再重新開啟後,工具列選取狀態回到筆刷
- [x] 4.2 把 AnnotationCanvas 觸發的 `onEraseStroke` 透過 PdfViewer 自身新增的 `onEraseStroke` prop 往上傳遞給呼叫方;驗證方式:components/PdfViewer.test.tsx 新增測試,斷言在(mock 過的)AnnotationCanvas 內觸發一次擦除,會呼叫 PdfViewer 收到的 `onEraseStroke` prop 並帶正確 index

## 5. PaperReader:儲存顏色/粗細與擦除

- [x] 5.1 更新 app/library/[id]/PaperReader.tsx 的 `handleStrokeComplete`,確保透過 `createStrokeNote` 儲存的 stroke 保留 AnnotationCanvas 產生的 color/width 欄位(不在伺服端呼叫前被去除);驗證方式:app/library/[id]/PaperReader.test.tsx 新增測試,斷言 `createStrokeNote` 被呼叫時帶有工具列當時選取的 color/width
- [x] 5.2 在 app/library/[id]/PaperReader.tsx 實作 `handleEraseStroke`:把被擦除的 stroke index(在當頁 `strokesForCurrentPage` 扁平陣列中的位置)對應回其所屬的 note id,呼叫 `deleteStrokeNote`,只有在刪除成功之後才把該筆記錄從 `notes` state 移除(對應設計決策「One Stroke Per Note Record 的擦除語意」與 spec 的 Whole-Stroke Erasing 需求);驗證方式:app/library/[id]/PaperReader.test.tsx 新增測試——(a) `deleteStrokeNote` 成功 resolve 後,對應筆記從畫面上的 NoteList 消失,(b) `deleteStrokeNote` reject 時,該筆記仍留在畫面上的 NoteList

## 6. 樣式與人工驗證

- [x] 6.1 在 app/globals.css 新增 `.annotation-toolbar` 樣式,讓工具列按鈕有清楚的選取/未選取視覺狀態(比照既有 `.pen-mode-active` 的視覺語言),且觸控熱區符合既有 button 慣例(至少 44px);驗證方式:用 `npm run dev` 啟動開發伺服器,人工檢查目前選取的工具/顏色/粗細按鈕與其他按鈕有明顯視覺區別
- [x] 6.2 執行完整測試套件(`npx vitest run`)與 `npm run build`,確認全數通過且沒有失敗測試;通過後以 `npx vercel --prod --yes` 部署,並用 curl 確認部署後的 `/login` 路徑回傳 HTTP 200
