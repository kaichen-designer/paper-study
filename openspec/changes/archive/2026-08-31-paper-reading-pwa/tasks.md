## 1. 專案骨架與部署基礎

- [x] [P] 1.1 建立 Next.js(App Router)專案並整合 next-pwa,`npm run build` 成功產出含 service worker 的建置結果,驗證方式:本機執行 `npm run build` 無錯誤,且產出目錄含 service worker 檔案(對應設計決策「前端框架採用 Next.js(App Router)+ next-pwa,而非 Vite + vite-plugin-pwa」)
- [x] [P] 1.2 建立 Supabase 專案,設定 `papers`、`notes`、`translation_cache` 三張資料表與 Row Level Security 規則,驗證方式:以兩個不同測試帳號個別寫入資料後,確認各自只能查詢到自己的資料列(對應設計決策「後端與資料同步採用 Supabase 免費方案(Postgres + Auth + Storage)」)
- [x] 1.3 將專案部署至 Vercel 並綁定 Supabase 環境變數,首頁可於部署網址正常載入,驗證方式:瀏覽器開啟部署網址可看到登入頁面而非錯誤畫面(對應設計決策「部署採用 Vercel 免費方案(Hobby plan)」)

## 2. 使用者認證與論文庫

- [x] 2.1 實作 Email/Magic Link 登入流程,未登入使用者存取論文庫會被導向登入頁,驗證方式:手動以無痕視窗開啟論文庫網址,確認被導向登入頁而非顯示論文資料(對應 Requirement: User Authentication)
- [x] [P] 2.2 實作以 Row Level Security 限定的資料存取,確保使用者只能查詢/操作自己的論文與筆記,驗證方式:以帳號 A 登入嘗試讀取帳號 B 建立的論文記錄,確認回傳空結果或權限錯誤(對應 Requirement: Access Scoping)
- [x] [P] 2.3 實作 PDF 上傳功能,上傳合法 PDF 後於 Supabase Storage 產生檔案並在 `papers` 表建立對應記錄,驗證方式:上傳一份測試 PDF 後於 Supabase 後台確認 Storage 檔案與資料表記錄皆存在(對應 Requirement: PDF Upload)
- [x] 2.4 對非 PDF 檔案的上傳顯示錯誤訊息且不建立論文記錄,驗證方式:嘗試上傳一份 `.txt` 檔案,確認畫面顯示錯誤訊息且 `papers` 表未新增記錄(對應 Requirement: PDF Upload)
- [x] 2.5 實作論文庫清單頁,重新整理頁面或以同帳號於第二裝置登入後,先前上傳的論文仍會出現在清單中,驗證方式:上傳論文後重新整理頁面確認清單仍顯示該論文,並於第二個瀏覽器以同帳號登入確認同一份論文出現(對應 Requirement: Paper List Persistence)

## 3. PDF 檢視與文字選取

- [x] 3.1 整合 pdf.js/react-pdf 渲染已上傳論文的頁面,開啟論文預設顯示第一頁,驗證方式:從論文庫點開一篇論文,確認畫面渲染出 PDF 第一頁內容(對應 Requirement: PDF Rendering and Pagination)
- [x] 3.2 實作翻頁功能,於第 N 頁觸發「下一頁」可渲染第 N+1 頁(當論文頁數大於 N 時),驗證方式:於多頁論文上點擊下一頁按鈕,確認畫面內容更新為下一頁(對應 Requirement: PDF Rendering and Pagination)
- [x] 3.3 使用 `getTextContent` 實作選取範圍文字抽取,使用者於頁面上選取文字後系統可取得對應文字內容,驗證方式:於渲染頁面上選取一段文字後於前端狀態或 console 確認抽取出對應文字字串(對應 Requirement: Text Selection Extraction,對應設計決策「PDF 翻譯呈現採用側邊/覆蓋翻譯面板,而非原地文字替換」)

## 4. 翻譯代理與快取

- [x] 4.1 建立 `app/api/translate/route.ts`,由伺服器端讀取環境變數中的 DeepL 金鑰呼叫翻譯 API,金鑰不得出現在任何前端程式碼或網路回應中,驗證方式:檢查瀏覽器開發者工具的 Network 分頁與前端打包後的 JS 檔案,確認找不到 DeepL 金鑰字串(對應 Requirement: Server-Side Key Protection,對應設計決策「翻譯金鑰保護採用伺服器端 API route 代理呼叫 DeepL」)
- [x] 4.2 實作選取文字翻譯功能,使用者選取文字並觸發翻譯後,翻譯結果顯示於側邊/覆蓋面板而不改動原 PDF 畫面,驗證方式:選取一段文字並點擊翻譯,確認側邊面板出現翻譯結果且原 PDF 頁面內容未被覆蓋或替換(對應 Requirement: Selection Translation)
- [x] 4.3 實作 `translation_cache` 表的查詢與寫入邏輯,同一段文字與目標語言重複翻譯時直接回傳快取結果而不重新呼叫 DeepL,驗證方式:對同一段文字重複觸發兩次翻譯,於 Supabase 後台或 API 呼叫記錄確認第二次未觸發新的 DeepL 呼叫(對應 Requirement: Translation Caching)
- [x] 4.4 實作翻譯失敗的錯誤處理,當 DeepL 呼叫逾時、額度用罄或發生錯誤時回傳明確錯誤狀態並於前端顯示失敗訊息,驗證方式:於開發環境模擬 DeepL API 回傳錯誤(如暫時輸入錯誤金鑰),確認前端顯示可見的翻譯失敗訊息而非空白或卡住(對應 Requirement: Translation Failure Handling)

## 5. 閱讀筆記與跨裝置同步

- [x] 5.1 實作筆記建立功能,使用者於選取範圍輸入筆記內容後,系統建立綁定該論文、頁碼與選取範圍的筆記記錄,驗證方式:選取文字並輸入筆記內容送出後,於 Supabase `notes` 表確認新增一筆包含 paper_id、page_number、selected_text、note_text 的記錄(對應 Requirement: Note Creation)
- [x] 5.2 確保筆記讀取一律以後端資料庫為主要來源,而非僅依賴本機儲存,驗證方式:清除瀏覽器本機儲存(IndexedDB/localStorage)後重新整理頁面,確認先前建立的筆記仍可正常顯示(對應 Requirement: Note Persistence)
- [x] 5.3 驗證同一帳號於不同裝置間的筆記同步,於裝置 A 建立筆記後,以同帳號登入裝置 B 開啟同一論文可看到該筆記,驗證方式:於桌機瀏覽器建立筆記後,於平板(或第二個瀏覽器設定檔)以同帳號登入開啟同一論文,確認筆記出現(對應 Requirement: Cross-Device Note Sync)

## 6. PWA 安裝與 iOS 打磨

- [x] [P] 6.1 設定 `public/manifest.json`(name、icon、`display: standalone`)並於 `app/layout.tsx` 加入 `apple-touch-icon`、`apple-mobile-web-app-capable` 等 iOS 專屬 meta tag,於 iPad Safari 執行「加入主畫面」後可用設定的名稱與圖示安裝,且從主畫面圖示開啟時為無瀏覽器網址列的獨立視窗,驗證方式:於實體 iPad Safari 執行加入主畫面並從主畫面圖示開啟,確認顯示設定的名稱/圖示且無網址列(對應 Requirement: iOS Installability)
- [x] [P] 6.2 設定 service worker 快取應用程式殼層(app shell),並確認快取清單不包含 PDF 檔案內容,離線狀態下開啟已安裝的應用程式可顯示快取的殼層而非網路錯誤,驗證方式:於 iPad 開啟飛航模式後開啟已安裝的 App,確認顯示應用程式介面殼層而非瀏覽器離線錯誤頁,並檢查 service worker 快取清單未包含 PDF 檔案(對應 Requirement: App Shell Offline Caching)
- [x] [P] 6.3 實作「本機儲存遺失後自動由後端重新取得資料」的邏輯,確保 iOS 清除本機儲存後重新連網開啟 App 時,論文與筆記資料可自動從 Supabase 重新載入而不需手動救回,驗證方式:手動清空瀏覽器本機儲存後於連網狀態重新開啟 App,確認論文清單與筆記皆正常顯示為最新資料(對應 Requirement: Local Cache Treated as Non-Durable)
