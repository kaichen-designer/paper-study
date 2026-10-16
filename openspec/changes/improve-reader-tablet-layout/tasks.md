## 1. 先寫測試(TDD):翻譯面板結構與行為

- [x] 1.1 [P] 在 components/TranslationPanel.test.tsx 新增失敗測試,涵蓋 Translation Panel Independent Scrolling 與 Translation Text Legibility 的可測部分:(a) 操作列容器 translation-panel-actions 內含標題「翻譯」與兩個翻譯按鈕;(b) 成功翻譯後譯文位於 translation-panel-result 區塊,且含換行字元的 translatedText 以單一區塊保留原字串;(c) 成功載入新譯文時,面板容器的 scrollTop 由非零被設為 0;(d) 翻譯失敗仍顯示 role="alert" 且不顯示 translation-panel-result;(e) 選取文字顯示於 translation-panel-source。驗證:執行 npx vitest run components/TranslationPanel.test.tsx,新測試先失敗(紅燈)。
- [x] 1.2 在同一測試檔確認 Non-Layout Behavior Unchanged:既有「送出 /api/translate 的請求內容為 text、targetLang ZH、paperId」測試維持不變並續通過。驗證:該測試在重構前後皆綠燈,檔案中此測試的斷言未被修改。

## 2. 翻譯面板元件結構

- [x] 2.1 重構 components/TranslationPanel.tsx 為「捲動容器 aside → 固定操作列 translation-panel-actions → 原文引用 translation-panel-source → 譯文 translation-panel-result」的結構,並在成功取得譯文時透過 ref 將容器 scrollTop 設為 0(對應「翻譯面板為獨立捲動區,操作列固定在面板頂端」)。props 與對 /api/translate 的請求內容不變。驗證:1.1 的測試轉綠,TranslationPanel 其餘既有測試與 app/library/[id]/PaperReader.test.tsx 全數通過且未修改斷言。

## 3. 閱讀頁容器

- [x] 3.1 [P] 在 app/library/[id]/page.tsx 的 main 加上 paper-reader-page 類別,使閱讀頁可獨立套用 Reader Page Width 的容器規則,不影響論文庫等其他頁面的 main。驗證:閱讀頁 DOM 的 main 含 paper-reader-page 類別,論文庫頁面的 main 不含(開啟兩頁以 read_page 或元素檢查確認)。

## 4. 版面與樣式(app/globals.css)

- [x] 4.1 實作「以 960px 為並排與堆疊的分界」與「並排比例 11:9 與翻譯面板最小寬度 380px」:960px 以上 paper-reader 為 grid(minmax(0, 11fr) minmax(380px, 9fr)),欄距 1rem、reader padding 0.75rem;960px 以下為單欄堆疊,論文區在上。移除原 800px 斷點的 flex 2:1 規則。這即 Responsive Reader Arrangement。驗證:Browser 面板在 1024×768 量到論文區約 528px、翻譯面板約 432px(±8px);在 820×1180 兩者皆為整個 reader 寬(約 772px)。
- [x] 4.2 實作「閱讀頁專屬的容器寬度 1280px」:main.paper-reader-page 的 max-width 1280px、左右 padding 0.75rem,全域 main 規則不變。驗證:1366×1024 下閱讀頁容器寬度介於 960 與 1280px 之間,論文庫頁面容器仍不超過 960px。
- [x] 4.3 實作「堆疊時降低論文頁面區高度,讓論文與譯文同屏」:堆疊配置的論文頁面區 max-height 為 56dvh(先寫 vh 後備值),並排配置為 calc(100dvh - 7rem)。驗證:820×1180 開啟閱讀頁、reader 頂端貼齊視窗頂端時,論文頁面區與翻譯面板頂端都在視窗內;並記錄最終採用的數值。
- [x] 4.4 實作 Translation Panel Independent Scrolling 的樣式:translation-panel 為 overflow-y: auto、overscroll-behavior: contain 的捲動容器;並排時 position: sticky、top 0.75rem、max-height calc(100dvh - 1.5rem);堆疊時 max-height 34dvh;translation-panel-actions 在面板內 sticky 於頂端並有背景色。驗證:1024×768 翻譯整頁(用長文字)後面板內出現捲軸、頁面本身不捲動;在面板內捲動後操作列仍在面板頂端。
- [x] 4.5 實作「翻譯文字排版數值」(Translation Text Legibility):translation-panel-result 字級 1.0625rem、行高 1.85、white-space: pre-line、段落間距 0.75em、max-width 34em、overflow-wrap: anywhere;translation-panel-source 字級 0.875rem、行高 1.6、max-height 6.5rem、overflow-y: auto。驗證:以 javascript_tool 讀 getComputedStyle 確認上述數值;1024×768 的譯文每行約 22–27 個中文字;含 3 段換行的測試文字顯示為 3 段。
- [x] 4.6 實作「按鈕列:等寬並排,窄時才折行」(Translation Action Buttons):translation-panel-actions 為 flex、wrap、gap 0.5rem,兩按鈕 flex 1 1 8rem,最小高度 44px。驗證:1024×768 兩按鈕在同一列、高度至少 44px、標籤不斷行;模擬面板寬度低於 300px 時改為兩列。
- [x] 4.7 實作「下方區塊的行寬與心得訊息樣式」(Secondary Section Readability):note-form、note-list、reflection-chat 最大寬 48rem 並置中;reflection-chat 的 ul 無項目符號與縮排,li 依 data-role 區分(user 靠右、淡底、最大寬 85%;assistant 靠左、白底卡片、細邊框),行高 1.75。驗證:1180×820 下心得對話容器寬度不超過 48rem 且水平置中;同時有 user 與 assistant 訊息時外觀可區分、無項目符號。

## 5. 驗證與收尾

- [ ] 5.1 實作「旋轉/視窗縮放時 PDF 寬度重新量測」的驗證:在 Browser 面板將視窗由 820×1180 切到 1180×820 再切回,確認 PDF 頁面寬度跟隨論文區容器、無橫向捲軸、無需重新整理;若 iOS 旋轉時量到舊寬度,於 components/PdfViewer.tsx 改用 ResizeObserver 並新增對應測試。驗證:記錄實測結果,必要時 components/PdfViewer.test.tsx 新增的測試通過。
- [ ] 5.2 以 768×1024、820×1180、834×1194、1024×768、1180×820、1366×1024 六組尺寸逐一檢視閱讀頁(含畫筆模式開啟時的標註工具列不被翻譯面板遮擋、文字選取後點擊翻譯可正常運作),對照 spec 的尺寸表與 Non-Layout Behavior Unchanged。驗證:每組尺寸皆無橫向捲軸、無重疊;結果寫入提交說明。
- [ ] 5.3 執行 npm test、npm run lint、npm run build 與 spectra validate improve-reader-tablet-layout。驗證:四項指令皆成功結束,且 git diff 不包含 lib/gemini、app/api 與 openspec/changes 下其他變更的檔案。
