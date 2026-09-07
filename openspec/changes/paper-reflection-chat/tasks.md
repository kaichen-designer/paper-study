## 1. 資料層

- [x] [P] 1.1 在 `lib/supabase/schema.sql` 新增 `reflection_messages` 資料表(`id, paper_id, user_id, role, content, created_at`)與對應 RLS 政策(比照 `notes` 表以 `auth.uid() = user_id` 限定存取),驗證方式:於 Supabase SQL Editor 執行遷移後,以兩個不同測試帳號個別寫入訊息,確認各自只能查詢到自己的訊息(對應設計決策「新增獨立的 `reflection_messages` 資料表,而非重用 notes 表」)
- [x] [P] 1.2 建立 `lib/pdf/extract-full-text.ts`,實作 `extractFullText(pdfDocument)`,遍歷 PDF 文件所有頁面呼叫 pdf.js 的 `getTextContent()` 並依頁碼順序串接文字後回傳,驗證方式:單元測試以模擬的多頁 PDF 文件物件(每頁回傳固定文字)呼叫,確認回傳字串包含所有頁面內容且順序正確;另測試單頁抽取失敗時整體呼叫回傳明確錯誤而非吞掉錯誤,`npx vitest run lib/pdf/extract-full-text.test.ts` 全數通過(對應 Requirement: Full Paper Text Extraction,對應設計決策「論文全文抽取:逐頁呼叫 pdf.js `getTextContent`,於使用者首次開啟對話面板時執行一次」)
- [x] [P] 1.3 建立 `lib/reflection/queries.ts`,實作 `listReflectionMessages(supabase, paperId)`(依 `created_at` 由舊到新排序)與 `saveReflectionMessage(supabase, { paperId, role, content })`,`user_id` 一律由 `supabase.auth.getUser()` 推導、函式簽章不接受呼叫端傳入 `user_id`,驗證方式:單元測試以兩個不同模擬使用者 session 呼叫 `saveReflectionMessage`,確認各自寫入的 `user_id` 對應各自登入者且從不互相污染(比照 `lib/notes/queries.test.ts` 的測試模式)(對應 Requirement: Persistent Cross-Device Conversation)

## 2. AI 回覆邏輯與 API route

- [x] 2.1 建立 `lib/reflection/generate-reply.ts`,實作 `generateReflectionReply({ supabase, paperId, paperFullText, conversationHistory, userMessage, apiKey, deps })`,呼叫 Gemini 時的 prompt 內容需包含論文全文與使用者本次訊息,成功時透過 `deps.saveMessage` 依序寫入使用者訊息與 AI 回應兩筆記錄,失敗時回傳 `{ ok: false, message }` 且不寫入任何記錄,驗證方式:單元測試以模擬的 Gemini provider 確認送出的 prompt 內容包含傳入的 `paperFullText` 與 `userMessage`;測試 provider 回傳失敗時確認 `deps.saveMessage` 未被呼叫(對應 Requirement: Grounded AI Feedback,對應設計決策「每次 API 呼叫都重新傳送論文全文與對話歷史,不做 context 快取」)
- [x] 2.2 建立 `app/api/reflect/route.ts`,伺服器端讀取環境變數中的 `GEMINI_API_KEY`(未設定時回傳明確錯誤,不繼續處理請求)呼叫 `generateReflectionReply`,金鑰不得出現在任何前端程式碼或網路回應中,驗證方式:檢查瀏覽器開發者工具的 Network 分頁與前端打包後的 JS 檔案,確認找不到 `GEMINI_API_KEY` 字串;手動以 curl 呼叫此 route 確認回傳格式為 `{ reply: string }`(對應設計決策「API route 沿用 `/api/translate` 的金鑰保護與錯誤處理模式」)

## 3. 前端整合

- [x] [P] 3.1 建立 `components/ReflectionChat.tsx`,顯示既有對話訊息(區分使用者/AI 兩種樣式)、提供輸入框與送出按鈕,送出後呼叫 `/api/reflect` 並將回應加入畫面上的訊息列表,任何時候都可以輸入(不檢查目前頁碼或閱讀進度),送出失敗時輸入框內容保留不清空並顯示錯誤訊息,驗證方式:單元測試模擬送出成功時畫面新增使用者訊息與 AI 回應兩則;模擬 API 呼叫失敗時確認輸入框的值未被清空且顯示 `role="alert"` 錯誤訊息(對應 Requirement: Reflection Message Submission,對應設計決策「對話面板隨時可開啟,不綁定「讀完論文」的判斷邏輯」)
- [x] [P] 3.2 修改 `components/PdfViewer.tsx`,新增 `onDocumentLoad?: (pdf) => void` callback prop,於 `Document` 的 `onLoadSuccess` 中同時把完整的 PDF 文件物件回傳給呼叫端(供全文抽取使用,不只回傳頁數),驗證方式:單元測試確認文件載入後 `onDocumentLoad` 被呼叫且收到的物件包含頁面存取所需的介面(對應 Requirement: Full Paper Text Extraction)
- [x] 3.3 修改 `app/library/[id]/page.tsx`,以 `lib/reflection/queries.ts#listReflectionMessages` 取得該論文既有對話訊息,並傳入 `PaperReader`,驗證方式:手動於已有對話記錄的論文重新整理頁面,確認先前訊息正確顯示(對應 Requirement: Persistent Cross-Device Conversation)
- [x] 3.4 修改 `app/library/[id]/PaperReader.tsx`,串接 `PdfViewer` 的 `onDocumentLoad` 保存 PDF 文件物件、在使用者首次與 `ReflectionChat` 互動時呼叫 `lib/pdf/extract-full-text.ts#extractFullText` 取得全文並隨訊息一併送往 `/api/reflect`,全文抽取失敗時 `ReflectionChat` 顯示錯誤狀態但不影響同頁面的翻譯與筆記功能運作,驗證方式:單元測試模擬全文抽取拋出錯誤,確認 `TranslationPanel`、`NoteForm` 元件仍正常渲染且可互動(對應 Requirement: Full Paper Text Extraction 的 Scenario「Extraction failure does not block other features」)
