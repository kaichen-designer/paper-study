## Context

目前專案為全新建立,尚無任何應用程式碼。此變更橫跨前端(PWA/iOS)、PDF 處理、翻譯代理與後端資料同步四個子系統,並引入多個新的外部依賴(Next.js、pdf.js、Supabase、DeepL),屬於跨子系統的架構性變更,故需要 design.md 記錄關鍵技術決策。

限制條件:
- 目標裝置為 iPad(iOS/iPadOS Safari),需可安裝到主畫面並具備 PWA 體驗
- 筆記需跨裝置同步(iPad 與桌機瀏覽器共用同一份資料)
- 整體需在免費或近乎免費的方案下運作,單人個人使用
- 翻譯功能使用者願自行申請 DeepL API 金鑰,但金鑰不可外洩於前端程式碼

## Goals / Non-Goals

**Goals:**

- 提供可在 iPad Safari 安裝為主畫面 App 的論文閱讀 PWA
- 支援 PDF 上傳、渲染、翻頁,以及選取文字/整頁翻譯
- 翻譯金鑰僅存在伺服器端,絕不出現在可被檢視的前端程式碼中
- 筆記/高亮綁定論文頁面與選取範圍,並透過雲端資料庫跨裝置同步
- 全部服務(部署、資料庫、儲存)使用免費方案即可運作

**Non-Goals:**

- 不做多使用者/團隊協作功能(僅供單一使用者個人帳號使用)
- 不做背景推播通知(iOS PWA 推播限制多,v1 不處理)
- 不做 PDF 原地文字替換翻譯(改採側邊/覆蓋翻譯面板,詳見決策)
- 不做離線完整可編輯模式(僅離線唯讀快取,不保證離線寫入同步)

## Decisions

### 前端框架採用 Next.js(App Router)+ next-pwa,而非 Vite + vite-plugin-pwa

Next.js 可在同一個 repo 內同時提供 PWA 前端頁面與後續翻譯代理所需的 API route(`app/api/translate/route.ts`),不需要另外架設或維護第二個後端服務。對單人維護的個人專案而言,單一可部署單元(Vercel 免費方案)比「前端 + 獨立後端」的組合更簡單、故障點更少。Vite + vite-plugin-pwa 雖然啟動較輕量,但仍需額外的 serverless function 才能安全代理翻譯金鑰,因此不採用。

### PDF 翻譯呈現採用側邊/覆蓋翻譯面板,而非原地文字替換

PDF 內容是絕對定位的字形而非可重排文字,`pdf.js` 的 `getTextContent` 在多欄排版、數學式、註腳等情境下容易抽出亂序文字。若嘗試將翻譯結果「塞回」PDF 畫面原位置,會因排版錯位而不穩定。改採「PDF 畫面照常渲染 + 側邊或可切換的翻譯面板顯示抽取文字的翻譯結果」,實作複雜度低且行為穩定,為多數學術 PDF 閱讀工具(如 Zotero 系列外掛)採用的作法。

### 翻譯金鑰保護採用伺服器端 API route 代理呼叫 DeepL

PWA 前端程式碼可被使用者或第三方檢視,DeepL 金鑰不可放在 `NEXT_PUBLIC_*` 或任何 client-side JS 中。改為前端呼叫自家 `app/api/translate/route.ts`,由該 route 讀取僅伺服器端可見的環境變數(於 Vercel 專案設定)呼叫 DeepL,並將結果依「文字內容 hash + 目標語言」快取進資料庫,避免重複消耗 DeepL 免費額度(約 50 萬字元/月)。

### 後端與資料同步採用 Supabase 免費方案(Postgres + Auth + Storage)

需求是筆記/高亮要跨裝置(iPad、桌機瀏覽器)同步,本機儲存(IndexedDB)在 iOS Safari 上可能被系統清除,不可作為單一真實來源。Supabase 免費方案一次提供 Postgres(存筆記 metadata)、Auth(email/magic link,避免額外 OAuth 設定成本)、Storage(存 PDF 檔案)與 Row Level Security(限定資料僅屬於單一使用者),免費額度(500MB 資料庫、1GB 檔案儲存)足夠個人使用累積數十篇論文。相較於自組 Neon + R2 + 自訂 Auth 的方案,Supabase 一站式的組合對單人維護更省事。

### 部署採用 Vercel 免費方案(Hobby plan)

Next.js 專案原生支援,免費方案的 serverless function 呼叫額度對單人使用完全足夠,且與 Supabase 的整合(環境變數注入)簡單直接。

## Implementation Contract

**行為(使用者可觀察到的結果):**
- 使用者在 iPad Safari 開啟部署網址,可透過「加入主畫面」安裝,安裝後以獨立視窗(無瀏覽器網址列)開啟,圖示與名稱取自 `public/manifest.json` 與 `apple-touch-icon`
- 使用者登入後可上傳 PDF,PDF 會出現在「我的論文庫」清單中,且該檔案已存於 Supabase Storage(重新整理頁面後清單仍存在)
- 開啟論文後可翻頁瀏覽 PDF 內容
- 使用者選取 PDF 上的文字後,可觸發翻譯,翻譯結果顯示於側邊/覆蓋面板,而非取代原 PDF 畫面文字
- 同一段文字重複翻譯(同一論文、同一語言對)不會重複呼叫 DeepL API(可由伺服器端記錄的呼叫次數或翻譯快取表驗證)
- 使用者可在選取範圍或頁面上建立筆記,筆記會寫入 Supabase 資料庫;以同一帳號在桌機瀏覽器登入後,可讀到 iPad 上建立的筆記(反之亦然)

**介面/資料形狀:**
- `papers` 資料表:`id, user_id, title, storage_path, uploaded_at, metadata`
- `notes` 資料表:`id, paper_id, user_id, page_number, position/anchor, selected_text, note_text, created_at`
- `translation_cache` 資料表:`id, source_text_hash, source_lang, target_lang, translated_text, paper_id`
- `POST /api/translate`:輸入 `{ text, target_lang, paper_id? }`,輸出 `{ translated_text, cached: boolean }`;金鑰讀取自伺服器端環境變數,不接受前端傳入金鑰

**失敗模式:**
- DeepL API 呼叫失敗(額度用罄、逾時、金鑰錯誤)時,`/api/translate` 回傳明確錯誤狀態與訊息,前端顯示「翻譯失敗,請稍後再試」而非靜默失敗
- Supabase 連線失敗時,論文庫/筆記畫面顯示可重試的錯誤狀態,不得讓使用者誤以為資料已儲存

**驗收標準:**
- 手動於實體 iPad Safari 驗證:安裝到主畫面、獨立視窗開啟、上傳 PDF、選取翻譯、寫筆記
- 手動於桌機瀏覽器以同一帳號驗證:iPad 建立的筆記可讀取,確認跨裝置同步成立
- 重複翻譯同一段文字時,檢查 `translation_cache` 表命中而非重新呼叫 DeepL

**範圍邊界:**
- 範圍內:PDF 檢視、選取/整頁翻譯、筆記/高亮、跨裝置同步、PWA 安裝與離線唯讀快取
- 範圍外:多使用者協作、背景推播、離線寫入同步、PDF 原地文字替換翻譯

## Risks / Trade-offs

- [iOS Safari 可能清除已安裝 PWA 的本機儲存(IndexedDB/localStorage),導致本機快取的草稿或設定消失] → 一律以 Supabase 為單一真實來源,本機儲存僅作加速快取,重要資料(筆記、論文清單)一律即時寫回後端,不依賴本機持久性
- [PDF 文字抽取(`getTextContent`)在多欄排版、數學式、註腳情境下容易產生亂序文字,影響翻譯品質] → v1 以「使用者選取範圍翻譯」為主要互動模式,而非整頁自動翻譯,降低排版錯亂造成的翻譯品質問題;整頁批次翻譯列為後續優化項目
- [Supabase 免費方案專案閒置約一週會自動暫停] → 暫停後的專案會在下次請求時自動喚醒,僅有些微冷啟動延遲,對個人使用可接受,不需額外處理
- [DeepL 免費額度(約 50 萬字元/月)可能因整頁翻譯大量消耗] → 以翻譯快取(`translation_cache`)避免重複翻譯同一段文字,並優先支援選取範圍翻譯而非整頁自動翻譯

## Migration Plan

全新專案,無既有資料或使用者需要遷移。部署步驟:
1. 建立 Supabase 專案,設定 Auth、建立 `papers`/`notes`/`translation_cache` 資料表與 Row Level Security 規則
2. 申請 DeepL API 金鑰,設定為 Vercel 專案的伺服器端環境變數
3. 將 Next.js 專案部署至 Vercel,綁定 Supabase 環境變數
4. 於實體 iPad 上以 Safari 開啟部署網址並「加入主畫面」完成安裝驗證

若後續需要回滾,直接停用 Vercel 部署即可,不影響 Supabase 內既有資料。

## Open Questions

- 整頁批次翻譯(而非僅選取範圍)是否納入 v1,或延後至後續變更,待實作 `pdf-reader`/`translation` 能力後再評估文字抽取品質決定
- 論文庫是否需要基本的搜尋/分類功能,或 v1 僅以清單呈現,待使用者累積一定論文數量後再評估
