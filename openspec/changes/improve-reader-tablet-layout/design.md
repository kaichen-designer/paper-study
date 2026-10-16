## Context

閱讀頁目前的結構(app/library/[id]/page.tsx → PaperReader.tsx):main(全站上限 960px)內依序是返回連結、標題、reader 區(PdfViewer + TranslationPanel)、已讀完狀態列、NoteForm、NoteList、ReflectionChat。

目前樣式(app/globals.css)的關鍵事實:

- reader 區在 800px 以上才並排,比例 flex 2 : 1;800px 以下上下堆疊。
- 翻譯面板有 sticky 與 padding,但沒有 max-height / overflow、沒有字級、行高、換行處理;原文 blockquote 沒有高度上限。
- 論文頁面區 max-height 75vh 並自行捲動;PDF 繪製寬度由 PdfViewer 在掛載與 window resize 時量測論文頁面區的 clientWidth 決定。
- ReflectionChat 的 section、ul、li 完全沒有樣式(只有 li 的 data-role 屬性可用)。

實測推算(平板):820px 直擺時翻譯面板僅約 245px 寬(文字可用約 211px,每行約 13 個中文字);1024px 橫擺約 292px 寬;翻譯整頁會形成高度遠超視窗的細長欄,而且無法在面板內捲動。此推算來自 CSS 數值計算,見 proposal.md 的表格;環境限制下無法以已登入的真實閱讀頁截圖(閱讀頁需要 Supabase 登入),實作階段必須在 Browser 面板以 768×1024、820×1180、834×1194、1024×768、1180×820、1366×1024 逐一驗證。

限制:

- 只動樣式與 TranslationPanel 的內部結構;不改 API、lib/gemini、資料庫。
- PDF 畫筆模式、文字選取(含點擊選句)、反思對話流程不得受影響。
- 觸控目標維持 44px 以上(現有 button 規則)。

## Goals / Non-Goals

**Goals:**

- 平板直擺(768–959px)與橫擺(960–1180px+)各有一個明確的版面,翻譯文字每行約 22–30 個中文字。
- 翻譯內容在面板內獨立捲動,不必為了讀譯文而捲動整頁;選取文字後譯文與論文頁面同時可見。
- 翻譯文字的字級、行高、段落、換行有明確數值。
- 下方筆記與心得區塊有可讀的行寬與基本樣式。

**Non-Goals:**

- 不做可拖曳分隔線、面板收合、浮動/抽屜式翻譯視窗、僅翻譯分頁。
- 不調整 PDF 縮放、畫筆模式、標註工具列。
- 不為手機(小於 600px)做專屬版面,只保證堆疊配置不橫向溢出。
- 不改色彩系統、不加深色模式。

## Decisions

### 以 960px 為並排與堆疊的分界

並排閾值由 800px 提高到 960px。理由:820/834px 直擺若並排,論文區在 55 : 45 下僅約 420px,PDF 內文會縮到難以辨識;堆疊時論文區可用滿約 772–786px。1024px 橫擺並排時論文區約 528px,翻譯面板約 432px,可容納約 23 個中文字/行(17px 字、扣掉 padding)。已考慮 900px 或 1000px:900 會讓 834 橫向旋轉前後的窄視窗(如分割視窗)仍並排但過窄;1000 會使 1024 的有效邊際太小,故選 960。

### 並排比例 11:9 與翻譯面板最小寬度 380px

使用 grid-template-columns: minmax(0, 11fr) minmax(380px, 9fr)。論文區仍略大於翻譯區(PDF 要讀整頁版面),翻譯區夠寬以達到行寬目標。比較過 2:1(現況,翻譯區太窄)與 1:1(1024 時論文區僅 480px,PDF 文字太小)。minmax 的 380px 下限防止在 960–1000px 區間翻譯面板被壓到低於可讀寬度。

### 閱讀頁專屬的容器寬度 1280px

在 app/library/[id]/page.tsx 的 main 加上 paper-reader-page 類別,於 app/globals.css 將其 max-width 設為 1280px、左右 padding 0.75rem(reader 容器 padding 同為 0.75rem,欄距 1rem)。不修改全域 main 規則,避免影響論文庫等頁面(規格要求論文庫維持 960px)。

### 翻譯面板為獨立捲動區,操作列固定在面板頂端

TranslationPanel 內部結構改為:aside(捲動容器,overflow-y: auto、overscroll-behavior: contain)→ 操作列容器(h2 與兩個按鈕,position: sticky; top: 0,背景同面板)→ 原文引用(選取時)→ 譯文或錯誤訊息。並排時 aside 為 position: sticky; top: 0.75rem; max-height: calc(100dvh - 1.5rem);堆疊時 max-height: 34dvh、不 sticky。dvh 之前先寫 vh 作為舊瀏覽器後備值。成功取得新譯文後,以 ref 將 scrollTop 設為 0(不用 scrollTo,jsdom 不支援,便於測試)。比較過讓整頁捲動(現況,捲走論文區)與 JS 量測高度(易與 iPad 網址列伸縮打架),選擇純 CSS 加一行 scrollTop。

### 堆疊時降低論文頁面區高度,讓論文與譯文同屏

堆疊配置下將論文頁面區 max-height 由 75vh 改為 56dvh(並排時改為 calc(100dvh - 7rem),讓頁面加翻頁控制列在一個視窗內)。以 820×1180 為例:56dvh ≈ 661px、控制列約 76px、面板 34dvh ≈ 401px、間距與 reader padding 約 64px,合計約 1200px:論文頁面區與翻譯面板頂端都落在 1180px 視窗內(面板頂端約在 800px 處),面板最底部可能略超出一點、以頁面捲動補足。這些為初始值,於實作階段以實機尺寸微調並記錄最終值。

### 翻譯文字排版數值

字級 1.0625rem(17px)、行高 1.85、white-space: pre-line 保留 API 回傳換行、段落間距 0.75em、最大寬度 34em、overflow-wrap: anywhere(避免長英文詞或網址撐破面板)。原文引用 0.875rem、行高 1.6、max-height 6.5rem、overflow-y: auto。選擇 pre-line 而不是改成多個 p:不需要解析文字、不改元件的資料契約。34em 在 17px 下為 578px,對應約 34 個全形字上限;面板在並排時本身只有約 395–465px 的文字寬,故實際約 23–27 字/行,堆疊時由 34em 上限壓在約 34 字以內。

### 按鈕列:等寬並排,窄時才折行

操作列使用 display: flex; flex-wrap: wrap; gap: 0.5rem,兩個按鈕 flex: 1 1 8rem,min-height 44px(沿用全域 button)。面板寬度低於約 300px 時才折成兩列。

### 下方區塊的行寬與心得訊息樣式

NoteForm、NoteList、ReflectionChat 的外層(note-form、note-list、reflection-chat)統一 max-width: 48rem、margin-inline: auto。ReflectionChat 的 ul 去除項目符號與縮排,li 依既有 data-role 屬性區分:user 靠右、淡底(沿用現有米色系 token)、max-width 85%;assistant 靠左、白底卡片、細邊框。行高 1.75。全為 CSS 變更,不改 ReflectionChat 的 JSX。

### 旋轉/視窗縮放時 PDF 寬度重新量測

PdfViewer 目前在 window resize 事件重新量測 clientWidth。裝置旋轉會觸發 resize,因此跨越 960px 時既有機制足以讓 PDF 重新適配寬度;不新增 ResizeObserver。驗證項目:實機或模擬器旋轉後,PDF 頁面寬度與論文區容器寬度一致、無橫向捲軸。若驗證發現 iOS 在旋轉時 resize 先於版面完成而量到舊寬度,於實作階段再改用 ResizeObserver(屬 PdfViewer 內部改動,範圍內)。

## Implementation Contract

**Behavior(使用者可觀察):**

- 960px 以上:reader 區為兩欄(論文 : 翻譯 ≈ 11 : 9,翻譯最小 380px);翻譯面板貼齊視窗頂端(0.75rem),高度不超過視窗減 1.5rem,內容在面板內捲動。
- 960px 以下:單欄,論文區在上(頁面區最高 56dvh),翻譯面板在其下(最高 34dvh,內部捲動)。
- 面板內操作列(標題 + 兩個按鈕)固定於面板頂端;新譯文成功載入時面板捲回頂端;錯誤訊息仍以 role="alert" 顯示於結果區。
- 譯文 17px / 行高 1.85 / 保留換行 / 最大寬 34em;原文引用最高 6.5rem 並可捲動。
- 閱讀頁 main 上限 1280px;其他頁面維持 960px。
- 筆記表單、筆記列表、心得對話最大寬 48rem 置中;心得訊息依角色區分外觀,無項目符號。

**Interface / data shape:**

- TranslationPanel 的 props(selectedText、pageText、paperId)與對 /api/translate 的請求內容(text、targetLang: "ZH"、paperId)不變。
- 新增或保留的類別名稱:translation-panel(捲動容器)、translation-panel-actions(固定操作列)、translation-panel-source(原文引用)、translation-panel-result(譯文)、paper-reader-page(閱讀頁 main)。既有類別 paper-reader、pdf-viewer、reflection-chat、note-form、note-list 保留。
- 譯文區塊渲染 translatedText 的文字內容不變(僅樣式不同),既有測試以文字查詢的斷言必須續通過。

**Failure modes:**

- 翻譯失敗時沿用現有錯誤文案與 role="alert",不顯示過期的譯文。
- 瀏覽器不支援 dvh 時退回 vh 後備值,版面仍可用(僅高度精度略差)。
- 不支援 sticky 的環境退回一般流排版,內容仍可讀、可捲動。

**Acceptance criteria:**

1. components/TranslationPanel.test.tsx 新增測試並通過:成功翻譯後譯文區塊套用 translation-panel-result 類別且文字完整;包含換行的 translatedText 以單一區塊渲染(換行字元保留在文字內容);成功載入新譯文時容器 scrollTop 被設為 0;錯誤時仍有 role="alert";操作列容器內含標題與兩個按鈕。
2. app/library/[id]/PaperReader.test.tsx 既有測試通過,且無需修改斷言(證明資料流程未變)。
3. npm test、npm run lint 與 npm run build 通過。
4. 手動(Browser 面板的 resize_window 模擬):在 768×1024、820×1180、834×1194、1024×768、1180×820、1366×1024 開啟閱讀頁,依 spec 的尺寸表量測論文區與翻譯面板寬度(誤差 ±8px)、確認無橫向捲軸、翻譯整頁時面板內部捲動且頁面不捲動、堆疊時論文頁面區與翻譯面板頂端同屏、旋轉時 PDF 重新適配;記錄結果在 tasks 完成備註或提交說明。
5. spectra validate improve-reader-tablet-layout 通過。

**Scope boundaries:**

- 範圍內:app/globals.css 的閱讀頁相關規則、app/library/[id]/page.tsx 的 main 類別、components/TranslationPanel.tsx 的結構與測試、必要時 PdfViewer 的寬度量測機制(僅在驗證證明需要時)。
- 範圍外:lib/gemini、app/api 與任何資料庫/遷移檔;PdfViewer 的畫筆與選取邏輯;ReflectionChat 與 NoteForm 的 JSX 與行為;論文庫頁面樣式;手機專屬版面;暫存中的 extend-gemini-retry-backoff 變更。

## Risks / Trade-offs

- [以 CSS 數值推算而非真實截圖定案] → 實作階段先以 6 組尺寸實測,數值(56dvh、34dvh、11:9)視為初始值,允許在不改 spec 條文語意的前提下微調;若需改動 spec 內數字,以 ingest 更新本變更。
- [dvh 在舊版 iOS(15.4 以前)不支援] → 先寫 vh 後備值,版面仍成立。
- [堆疊時 PDF 區縮短到 56dvh,內部捲動區變小] → 論文頁面區原本就是自身捲動區(75vh),使用者操作模式不變;若實測發現頁面太矮,調整為 60dvh 並同步縮小翻譯面板上限。
- [面板為捲動容器,可能與 iOS 的文字選取拖曳手把競爭] → 面板內的譯文並非選取翻譯的來源(來源是 PDF 文字層),且畫筆模式開啟時整個文件已禁止選取;實測確認在面板內雙指捲動與長按選字不會觸發翻譯。
- [sticky 的面板在並排時與頁首(h1、返回連結)一起捲動出畫面後才貼頂] → 這是預期行為;面板高度限制使其在任何捲動位置都可完整使用。
- [放寬到 1280px 使桌機寬螢幕的 PDF 變大] → 並排比例固定,PDF 隨寬度變大屬正向變化,但頁面區 max-height 同時限制高度,不會超出一個視窗。

## Open Questions

- 無(已與提案的取捨一致)。若使用者想要「可收合翻譯面板」或「僅翻譯分頁」模式,另開獨立變更。
