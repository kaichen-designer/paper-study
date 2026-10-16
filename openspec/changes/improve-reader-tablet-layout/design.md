## Context

閱讀頁目前的結構(app/library/[id]/page.tsx → PaperReader.tsx):main(閱讀頁上限 1280px,其他頁 960px)內依序是返回連結、標題、reader 區(PdfViewer + TranslationPanel)、已讀完狀態列、NoteForm、NoteList、ReflectionChat。

第一輪實作後(已部署 Preview 並由使用者在平板實測)的樣式事實(app/globals.css):

- reader 區在 960px 以上為 grid(11fr : 9fr、翻譯面板最小 380px),以下為單欄堆疊。
- 論文頁面區(.pdf-viewer-page)有最大高度——堆疊 56dvh、並排 calc(100dvh - 7rem)——並且 overflow: auto,是一個自己的捲動框;PDF 繪製寬度由 PdfViewer 在掛載與 window resize 時量測此容器的 clientWidth 決定。
- 翻譯面板為捲動容器(overflow-y: auto、overscroll-behavior: contain),並排時 sticky 且最高為視窗高度減 1.5rem,堆疊時最高 34dvh。
- PdfViewer 在使用者選取文字期間,對 .pdf-viewer-page 設定 touch-action: none(實驗性做法,避免 iOS 的選取把手與捲動競爭),選取清除前無法從 PDF 上起手捲動。

第二輪回饋(使用者在 Preview 上實測,2026-10-17):

1. 看不到整頁原始 PDF——頁面區被高度上限裁切,只能在小框內捲動。
2. 希望翻譯面板的高度可以在介面上自行調整。
3. 可上下捲動的區塊太多(PDF 區、翻譯面板、整頁),整頁要往下滑時手指常落在內層捲動區而被攔住。
4. 提到「現在不能手動放大頁面」,原因未確認(見 Open Questions)。

限制:

- 只動樣式與 TranslationPanel 的內部結構與行為;不改 API、lib/gemini、資料庫。
- PDF 畫筆模式、文字選取(含點擊選句)、反思對話流程不得受影響。
- 觸控目標維持 44px 以上(現有 button 規則)。
- 此環境無法登入真實閱讀頁截圖(閱讀頁需要 Supabase 登入);版面數值以「真實元件標記 + 真實 globals.css」的測試頁在 Browser 面板量測,真實 PDF 與畫筆行為需在 Preview 部署上於平板確認。

## Goals / Non-Goals

**Goals:**

- 平板直擺(768–959px)與橫擺(960–1180px+)各有一個明確的版面,翻譯文字每行約 22–30 個中文字。
- 論文頁面區完整展開,不被高度上限裁切,整頁 PDF 可用頁面捲動看完。
- 翻譯面板的高度可由使用者拖曳調整、跨次開啟記住;預設高度仍合理。
- 閱讀頁上「自己有垂直捲動框」的區塊由兩個(PDF 區、翻譯面板)減為一個(翻譯面板),且面板捲到底後手勢可接續捲動頁面。
- 翻譯文字的字級、行高、段落、換行有明確數值;下方筆記與心得區塊有可讀的行寬與基本樣式。

**Non-Goals:**

- 不做可拖曳調整左右寬度的分隔線、面板收合、浮動/抽屜式翻譯視窗(含貼齊視窗底部的 bottom sheet)、僅翻譯分頁。
- 不調整 PDF 縮放、畫筆模式、標註工具列;不新增 PDF 縮放按鈕(見 Open Questions)。
- 不改變選取文字期間暫停 PDF 捲動的既有行為。
- 不為手機(小於 600px)做專屬版面,只保證堆疊配置不橫向溢出。
- 不改色彩系統、不加深色模式。

## Decisions

### 以 960px 為並排與堆疊的分界

並排閾值由 800px 提高到 960px。理由:820/834px 直擺若並排,論文區在 55 : 45 下僅約 420px,PDF 內文會縮到難以辨識;堆疊時論文區可用滿約 772–786px。1024px 橫擺並排時論文區約 528px,翻譯面板約 432px,可容納約 23 個中文字/行(17px 字、扣掉 padding)。已考慮 900px 或 1000px:900 會讓 834 橫向旋轉前後的窄視窗(如分割視窗)仍並排但過窄;1000 會使 1024 的有效邊際太小,故選 960。(第一輪決定,第二輪不變。)

### 並排比例 11:9 與翻譯面板最小寬度 380px

使用 grid-template-columns: minmax(0, 11fr) minmax(380px, 9fr)。論文區仍略大於翻譯區(PDF 要讀整頁版面),翻譯區夠寬以達到行寬目標。比較過 2:1(現況,翻譯區太窄)與 1:1(1024 時論文區僅 480px,PDF 文字太小)。minmax 的 380px 下限防止在 960–1000px 區間翻譯面板被壓到低於可讀寬度。(第一輪決定,第二輪不變。)

### 閱讀頁專屬的容器寬度 1280px

在 app/library/[id]/page.tsx 的 main 加上 paper-reader-page 類別,於 app/globals.css 將其 max-width 設為 1280px、左右 padding 0.75rem(reader 容器 padding 同為 0.75rem,欄距 1rem)。不修改全域 main 規則,避免影響論文庫等頁面(規格要求論文庫維持 960px)。(第一輪決定,第二輪不變。)

### 論文頁面區以完整高度展開

(第二輪新增,取代第一輪的「堆疊時降低論文頁面區高度」決定。)

移除 .pdf-viewer-page 的 max-height 與 overflow: auto(改為 overflow: visible,圓角裁切仍由外層 .pdf-viewer 的 overflow: hidden 負責)。PDF 頁面以容器寬度適配後依原比例完整展開,頁面區高度由內容決定,閱讀靠整個文件的捲動。

數值推算:堆疊在 820px 時頁面寬約 757px、高約 980px(A4/Letter 比例約 1:1.294)加上 2rem 垂直 padding 與翻頁控制列,整個論文區約 1,100px,比 1180px 視窗略短但比 768px 直擺(1024 高)的可視區還高一些;並排在 1024px 時頁面寬約 520px、高約 673px,整個論文區約 780px。

選擇原因:使用者明確選擇「完整高度、跟著頁面捲」而不是「縮小到一個畫面」;後者在直擺平板上內文字會變小難讀。代價:堆疊時翻譯面板落在整頁 PDF 之後,選字後需往下捲才看到譯文(第一輪的「論文與譯文同屏」目標在堆疊配置中取消;並排配置因翻譯面板 sticky 而仍同屏)。這項代價列為 Open Questions,待使用者實測後再決定是否加入貼底面板或自動捲動。

比較過:保留 max-height 但提高到 85dvh(仍是裁切與巢狀捲動,只是少裁一點,拒絕);以 JS 依視窗高度縮放頁面使整頁入框(縮小文字,使用者拒絕)。

### 翻譯面板為獨立捲動區,操作列固定在面板頂端

TranslationPanel 內部結構改為:aside(捲動容器,overflow-y: auto)→ 操作列容器(h2 與兩個按鈕,position: sticky; top: 0,背景同面板)→ 原文引用(選取時)→ 譯文或錯誤訊息 → 底部拖曳把手(見下一項)。並排時 aside 為 position: sticky; top: 0.75rem;預設最高 90dvh(與拖曳把手的上限相同,避免第一次拖曳時高度跳動,且不超過視窗高度減 1.5rem);堆疊時預設最高 34dvh、不 sticky。dvh 之前先寫 vh 作為舊瀏覽器後備值。成功取得新譯文後,以 ref 將 scrollTop 設為 0(不用 scrollTo,jsdom 不支援,便於測試)。(第一輪決定;第二輪移除 overscroll-behavior: contain,見「巢狀捲動區減為一個」。)

### 翻譯面板高度由拖曳把手調整並記住

(第二輪新增。)

**互動**:aside 最後一個子元素是 div.translation-panel-resizer,role="separator"、aria-orientation="horizontal"、aria-label="調整翻譯面板高度"、tabIndex=0,並帶 aria-valuemin、aria-valuemax、aria-valuenow(目前面板高度 px,四捨五入)。外觀為 44px 高的貼底橫條(position: sticky; bottom: 0,置於面板捲動容器內),中央一條視覺握把,touch-action: none 只套在這個元素上,面板其他區域不受影響。

**拖曳**:onPointerDown 記錄起始 clientY 與起始高度(自訂高度,否則為 aside 目前的 getBoundingClientRect().height),並 setPointerCapture(以可選呼叫保護,jsdom 無此方法);onPointerMove 在拖曳中把高度設為 起始高度 + (clientY - 起始 clientY),夾在 [MIN, MAX];onPointerUp / onPointerCancel 結束拖曳並寫入 localStorage。往下拖變高、往上拖變矮(把手在面板底部,堆疊與並排兩種配置的語意一致:並排時面板頂端貼視窗,往下拖才會加高)。手指與 Apple Pencil 皆為 pointer events,無需另外處理。

**鍵盤**:把手取得焦點時,ArrowDown +24px、ArrowUp −24px、Home 設為 MIN、End 設為 MAX,並 preventDefault;每次變更都寫入 localStorage。

**界線**:MIN = 200px(操作列約 104px 加 44px 把手後仍留約 50px 內容);MAX = floor(window.innerHeight × 0.9),在每次拖曳或按鍵時重新取得。

**套用方式**:高度以 CSS 自訂屬性 --translation-panel-height 設在 aside 的 style 上;樣式為 height: var(--translation-panel-height, auto);max-height 在堆疊為 min(var(--translation-panel-height, 34dvh), 90dvh)、並排為 min(var(--translation-panel-height, 90dvh), 90dvh)。未自訂時維持第一輪的預設;自訂後面板固定為該高度(內容較少時留白),最高仍受視窗限制,因此旋轉裝置後不會超出視窗。

**儲存**:localStorage 鍵為 translation-panel-height,值為整數 px 字串。掛載後在 useEffect 讀取(避免伺服器端渲染不一致);所有存取包 try/catch,拋錯或值不是有限數字、或小於 MIN 或大於 4000 時忽略並使用預設;套用時再夾入目前的 [MIN, MAX]。存放在瀏覽器代表各裝置各自記住,不跨裝置同步。

比較過:CSS resize: vertical(iOS Safari 不支援,拒絕)、小/中/大三段按鈕(使用者選擇拖曳把手)、把手放在面板頂端(並排時面板頂端貼著視窗,往上拖無空間,語意不一致)、存到資料庫(需要資料表與遷移,範圍過大)。

### 巢狀捲動區減為一個

(第二輪新增。)

第一輪的閱讀頁有三層可垂直捲動:整個頁面、PDF 頁面區(overflow: auto)、翻譯面板(overflow-y: auto 加 overscroll-behavior: contain)。第二輪:

- PDF 頁面區改為完整高度、不捲動(見前述決定),只剩整個頁面與翻譯面板。
- 移除翻譯面板的 overscroll-behavior: contain,維持預設的 auto,使面板內容捲到頂端或底端後,同一個手勢可接續捲動整個頁面,降低手指被內層捲動區攔住的感覺。
- 並排時翻譯面板 sticky 於視窗側邊,捲動頁面時它跟著停在原處,不會被捲走;堆疊時翻譯面板在整頁 PDF 之後,不 sticky。
- 原文引用區塊(translation-panel-source,最高 6.5rem、overflow-y: auto)位於面板內,屬於面板的一部分,不計入閱讀頁的「頂層」捲動區;維持第一輪設定。
- 拖曳把手的 touch-action: none 只作用在把手本身,不影響其他區域的頁面捲動。

### 選取文字時暫停捲動在整頁展開後的影響

PdfViewer 在存在有效文字選取時,對 .pdf-viewer-page 設 touch-action: none,選取清除前無法從 PDF 上起手捲動頁面。第一輪時 PDF 區只佔視窗一部分,使用者可從 PDF 以外的區域捲頁;第二輪 PDF 區整頁展開後,論文區幾乎佔滿視窗寬度,選取文字後若要往下捲到翻譯面板(堆疊配置),必須先點一下空白處清除選取,或從 PDF 區外(例如右側空白邊距、面板上)起手捲動。本輪不改這個既有行為(屬 PdfViewer 內部、與畫筆/選取穩定性有關,風險不明),僅在 Open Questions 記錄,並於 Preview 實測時確認是否造成困擾。

### 翻譯文字排版數值

字級 1.0625rem(17px)、行高 1.85、white-space: pre-line 保留 API 回傳換行、段落間距 0.75em、最大寬度 34em、overflow-wrap: anywhere(避免長英文詞或網址撐破面板)。原文引用 0.875rem、行高 1.6、max-height 6.5rem、overflow-y: auto。選擇 pre-line 而不是改成多個 p:不需要解析文字、不改元件的資料契約。34em 在 17px 下為 578px,對應約 34 個全形字上限;面板在並排時本身只有約 395–465px 的文字寬,故實際約 22–27 字/行,堆疊時由 34em 上限壓在約 34 字以內。(第一輪決定,第二輪不變。)

### 按鈕列:等寬並排,窄時才折行

操作列使用 display: flex; flex-wrap: wrap; gap: 0.5rem,兩個按鈕 flex: 1 1 8rem,min-height 44px(沿用全域 button),white-space: nowrap 避免 CJK 標籤在字中間折行。面板寬度低於約 300px 時才折成兩列。(第一輪決定,第二輪不變。)

### 下方區塊的行寬與心得訊息樣式

NoteForm、NoteList、ReflectionChat 的外層(note-form、note-list、reflection-chat)統一 max-width: 48rem、margin-inline: auto。ReflectionChat 的 ul 去除項目符號與縮排,li 依既有 data-role 屬性區分:user 靠右、淡底、max-width 85%;assistant 靠左、白底卡片、細邊框。行高 1.75。全為 CSS 變更,不改 ReflectionChat 的 JSX。(第一輪決定,第二輪不變。)

### 旋轉/視窗縮放時 PDF 寬度重新量測

PdfViewer 目前在 window resize 事件重新量測 clientWidth。裝置旋轉會觸發 resize,因此跨越 960px 時既有機制足以讓 PDF 重新適配寬度;不新增 ResizeObserver。驗證項目:實機或模擬器旋轉後,PDF 頁面寬度與論文區容器寬度一致、無橫向捲軸。若驗證發現 iOS 在旋轉時 resize 先於版面完成而量到舊寬度,於實作階段再改用 ResizeObserver(屬 PdfViewer 內部改動,範圍內)。第二輪移除了 .pdf-viewer-page 的內部捲動框,量測對象 clientWidth 不再受捲軸寬度影響,此決定不變。

## Implementation Contract

**Behavior(使用者可觀察):**

- 960px 以上:reader 區為兩欄(論文 : 翻譯 ≈ 11 : 9,翻譯最小 380px);論文頁面區完整高度、不捲動;翻譯面板貼齊視窗頂端(0.75rem),預設最高為視窗高度的 90%,內容在面板內捲動。
- 960px 以下:單欄,論文區在上(完整高度),翻譯面板在其下(預設最高 34dvh,內部捲動,不 sticky)。
- 面板底部有拖曳把手:往下拖加高、往上拖縮矮,高度夾在 200px 到視窗高度的 90%;放開後記住高度,重新開啟閱讀頁沿用;方向鍵可微調(±24px),Home/End 到最小/最大。
- 面板內捲到頂端或底端後,手勢可接續捲動整個頁面。
- 面板內操作列(標題 + 兩個按鈕)固定於面板頂端;新譯文成功載入時面板捲回頂端;錯誤訊息仍以 role="alert" 顯示於結果區。
- 譯文 17px / 行高 1.85 / 保留換行 / 最大寬 34em;原文引用最高 6.5rem 並可捲動。
- 閱讀頁 main 上限 1280px;其他頁面維持 960px。
- 筆記表單、筆記列表、心得對話最大寬 48rem 置中;心得訊息依角色區分外觀,無項目符號。

**Interface / data shape:**

- TranslationPanel 的 props(selectedText、pageText、paperId)與對 /api/translate 的請求內容(text、targetLang: "ZH"、paperId)不變。
- 類別名稱:translation-panel(捲動容器)、translation-panel-actions(固定操作列)、translation-panel-source(原文引用)、translation-panel-result(譯文)、translation-panel-resizer(拖曳把手,第二輪新增)、paper-reader-page(閱讀頁 main)。既有類別 paper-reader、pdf-viewer、reflection-chat、note-form、note-list 保留。
- 拖曳把手的無障礙屬性:role="separator"、aria-orientation="horizontal"、aria-label="調整翻譯面板高度"、aria-valuemin="200"、aria-valuemax(目前視窗高度的 90%,整數)、aria-valuenow(目前面板高度 px,整數)、tabIndex=0。
- localStorage 鍵 translation-panel-height,值為整數 px 的字串;讀寫皆 try/catch,失敗時行為等同未自訂。
- 譯文區塊渲染 translatedText 的文字內容不變(僅樣式不同),既有測試以文字查詢的斷言必須續通過。

**Failure modes:**

- 翻譯失敗時沿用現有錯誤文案與 role="alert",不顯示過期的譯文。
- localStorage 不可用(拋錯或值不合法)時,面板使用預設高度,拖曳仍可調整但不保存,不影響翻譯功能。
- 瀏覽器不支援 dvh 時退回 vh 後備值,版面仍可用(僅高度精度略差)。
- 不支援 sticky 的環境退回一般流排版,內容仍可讀、可捲動。
- 旋轉裝置使視窗變矮時,自訂高度仍被 max-height 限制在視窗內,不會超出。

**Acceptance criteria:**

1. components/TranslationPanel.test.tsx 新增測試並通過(第一輪):成功翻譯後譯文區塊套用 translation-panel-result 類別且文字完整;包含換行的 translatedText 以單一區塊渲染;成功載入新譯文時容器 scrollTop 被設為 0;錯誤時仍有 role="alert";操作列容器內含標題與兩個按鈕。
2. components/TranslationPanel.test.tsx 新增把手測試並通過(第二輪):把手具備 role="separator" 與 aria-valuemin、aria-valuemax、aria-valuenow;ArrowDown/ArrowUp 以 24px 增減 aria-valuenow 並被夾在最小/最大之間,Home/End 到達最小/最大;pointer 拖曳(以 clientY 差值)改變高度並在放開時寫入 localStorage;掛載時讀到合法的 localStorage 值會套用,不合法(非數字、小於 200、大於 4000)則忽略;localStorage 讀寫拋錯時不崩潰且仍可調整。
3. app/library/[id]/PaperReader.test.tsx 既有測試通過,且無需修改斷言(證明資料流程未變);components/PdfViewer.test.tsx 通過。
4. npm test 與 npm run build 通過(lint 在此專案尚未設定 ESLint,不列為門檻)。
5. 手動(Browser 面板的 resize_window 模擬,以測試頁量測):在 768×1024、820×1180、834×1194、1024×768、1180×820、1366×1024:論文頁面區的 scrollHeight 等於 clientHeight(無內部捲動)且高度等於頁面完整高度;頁面上 overflow 為 auto 且實際可捲動的頂層元素只有翻譯面板;無橫向捲軸;並排時翻譯面板在捲動頁面時維持貼齊視窗頂端;拖曳或鍵盤調整後面板高度改變且不超過視窗高度的 90%。結果記錄在 tasks 完成備註或提交說明。
6. 手動(Preview 部署,平板實機):整頁 PDF 可用頁面捲動看完;面板高度可拖曳並在重新整理後保留;直擺與橫擺旋轉後 PDF 重新適配;畫筆模式開啟時工具列不被遮擋。實機結果由使用者回報。
7. spectra validate improve-reader-tablet-layout 通過。

**Scope boundaries:**

- 範圍內:app/globals.css 的閱讀頁相關規則、app/library/[id]/page.tsx 的 main 類別、components/TranslationPanel.tsx 的結構與行為(含拖曳把手與 localStorage)及其測試、必要時 PdfViewer 的寬度量測機制(僅在驗證證明需要時)。
- 範圍外:lib/gemini、app/api 與任何資料庫/遷移檔;PdfViewer 的畫筆、選取與選取期間暫停捲動的邏輯;ReflectionChat 與 NoteForm 的 JSX 與行為;論文庫頁面樣式;手機專屬版面;PDF 縮放按鈕;堆疊時貼底的翻譯面板;跨裝置同步面板高度。

## Risks / Trade-offs

- [以測試頁而非真實頁面量測] → 測試頁使用真實元件標記與真實樣式表,但 PDF 以固定比例的方塊取代;PDF 實際繪製、畫筆、選取需在 Preview 平板實機確認(驗收 6)。
- [堆疊時整頁 PDF 展開,翻譯面板落在其後,選字後需往下捲才看到譯文] → 這是使用者選擇「完整高度」的已知代價;並排(橫擺)不受影響。若實測仍不便,後續可評估貼底面板或選字後自動捲動(Open Questions)。
- [選取文字期間 PdfViewer 暫停頁面捲動,整頁展開後影響範圍變大] → 本輪不動;實測若困擾,另案處理(例如選取後保留邊距可捲動區或改用不同的選取/捲動策略)。
- [拖曳把手在 iOS 上與頁面捲動手勢競爭] → 把手只有 44px 高並設 touch-action: none,面板其餘區域不受影響;實機若不易拖,可加大把手高度。
- [dvh 在舊版 iOS(15.4 以前)不支援] → 先寫 vh 後備值,版面仍成立。
- [面板為捲動容器,可能與 iOS 的文字選取拖曳手把競爭] → 面板內的譯文並非選取翻譯的來源(來源是 PDF 文字層),且畫筆模式開啟時整個文件已禁止選取;實測確認在面板內雙指捲動與長按選字不會觸發翻譯。
- [sticky 的面板在並排時與頁首(h1、返回連結)一起捲動出畫面後才貼頂] → 這是預期行為;面板高度限制使其在任何捲動位置都可完整使用。
- [放寬到 1280px 使桌機寬螢幕的 PDF 變大] → 並排比例固定;第二輪頁面區不再限制高度,桌機大螢幕上 PDF 會更高,需用頁面捲動閱讀,屬預期。
- [localStorage 在隱私模式或被清除時不可用] → try/catch,退回預設高度。

## Open Questions

- **「現在不能手動放大頁面」**:原因未確認。app/layout.tsx 的 viewport 設定(width: device-width、initialScale: 1)沒有禁用縮放,AnnotationCanvas 也只在畫筆模式下才對頁面使用 touch-action: pinch-zoom。需向使用者確認是「雙指捏合縮放失效」(可能與選取期間的 touch-action: none、或在面板/把手上操作有關),還是「希望有 PDF 放大/縮小按鈕」。確認前不實作。
- **堆疊時要不要讓翻譯面板貼齊視窗底部,或選字後自動捲到翻譯面板?** 取決於使用者在直擺平板實測「需往下捲才看到譯文」是否困擾。
- **選取文字期間暫停頁面捲動的影響**:是否需要調整,待實測。
