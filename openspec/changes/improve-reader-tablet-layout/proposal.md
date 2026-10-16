## Summary

重新設計閱讀頁(論文區 + 翻譯面板 + 下方筆記/心得區)在平板尺寸(約 768–1024px,含直擺與橫擺)的版面:翻譯面板改成「寬度夠、可獨立捲動、字級與行距適合閱讀中文」的閱讀欄,並依方向切換並排或上下堆疊兩種配置。

## Motivation

使用者回報在平板上閱讀翻譯時,右側翻譯欄是一整條窄長欄位,內容難以閱讀。檢視目前版面(app/globals.css 的 paper reader 區塊、components/TranslationPanel.tsx、components/ReflectionChat.tsx、app/library/[id]/PaperReader.tsx)後,確認問題來自下列組合,而非單一樣式:

1. **欄位過窄**:閱讀頁沿用全站 main 的 960px 上限,且 800px 以上就切成 PDF:翻譯 = 2:1 並排。實際可用寬度推算如下(main 左右 padding 1rem、reader padding 1rem、欄距 1.25rem、翻譯面板 padding 1rem + 邊框):

   | 視窗寬度 | 論文區寬 | 翻譯面板寬 | 翻譯文字可用寬(16px 字) |
   | -------- | -------- | ---------- | ------------------------ |
   | 768(直擺,未達 800 → 上下堆疊) | 704 | 704 | 約 670px,但翻譯被擠到 PDF 下方,選字後要捲出 PDF 才看得到 |
   | 820(iPad 直擺) | 約 491 | 約 245 | 約 211px,每行僅約 13 個中文字 |
   | 834 | 約 500 | 約 250 | 約 216px,每行約 13 個中文字 |
   | 1024(橫擺) | 約 584 | 約 292 | 約 258px,每行約 16 個中文字 |

   每行 13–16 字遠低於中文閱讀的舒適行寬(約 22–32 字),按鈕「翻譯選取範圍」「翻譯整頁」也因空間不足而折行。
2. **沒有獨立捲動與高度限制**:翻譯面板只有 sticky,沒有 max-height 與 overflow。翻譯整頁(數百到上千字)在 211px 寬度下會變成 1,500px 以上的細長欄,比視窗還高;sticky 失去作用,使用者必須捲動整個頁面才能讀完,同時論文區被捲走。
3. **排版屬性缺少**:翻譯文字沿用瀏覽器預設行距,沒有段落間距;API 回傳的換行因 p 元素而被壓平;原文引用區塊(blockquote)沒有高度限制,長選取會把譯文推到畫面外。
4. **主容器上限**:960px 上限在橫擺的大尺寸平板(1180–1366px)兩側留白過多,卻讓並排的兩欄都偏窄。
5. **下方區塊未設計**:心得對話(ReflectionChat)沒有任何樣式——保留瀏覽器預設的項目符號與縮排,使用者與助理訊息(已有 data-role 屬性)外觀相同,行寬隨容器拉滿。

## Proposed Solution

只調整版面、樣式與翻譯面板的內部結構,不改翻譯/心得的資料流程、API 與資料庫。細節與數值見 design.md,可驗證行為見 specs/reader-layout/spec.md。重點:

- **兩種配置,以 960px 為分界**(取代現行 800px):
  - 960px 以上(平板橫擺、桌機):論文區 : 翻譯面板 = 11 : 9(約 55 : 45),翻譯面板最小 380px;閱讀頁 main 上限放寬到 1280px,左右 padding 縮為 0.75rem。1024px 時約為 528px : 432px,1180px 時約為 614px : 502px。
  - 960px 以下(平板直擺,含 768、820、834):單欄上下堆疊,論文區在上、翻譯面板緊接在翻譯操作列之下,兩者高度合計約一個螢幕,選字後不必捲動頁面就能看到譯文。
- **翻譯面板成為獨立捲動區**:並排時 sticky 並限制高度為視窗高度減邊距,堆疊時限制為視窗高度約三分之一;面板內部捲動(overscroll 不外溢到頁面),操作列在面板內固定於頂端,新譯文載入時捲回頂端。
- **翻譯文字排版**:字級 17px(1.0625rem)、行高 1.85、保留回傳換行(pre-line)、段落間距約 0.75em、文字區塊最大寬度約 34em,使每行約 22–30 個中文字;原文引用字級 0.875rem、行高 1.6、高度上限約 6.5rem 並可捲動。
- **按鈕**:兩個翻譯按鈕並排、等寬,維持 44px 以上觸控高度,窄時才折行。
- **下方區塊**:筆記表單、筆記列表、心得對話限制最大寬度約 48rem 並置中;心得對話移除項目符號、依 data-role 區分使用者(靠右、淡底)與助理(靠左、卡片)訊息,訊息行高 1.75。

## Non-Goals

- 不改變翻譯、反思對話、筆記的資料流程、API 路由、lib/gemini 與 app/api 下的任何檔案。
- 不新增可拖曳調整寬度的分隔線、不新增面板收合/浮動視窗、不新增「僅翻譯」分頁模式(評估後認為會增加狀態與 PDF 寬度重新量測的複雜度,可作為後續獨立變更)。
- 不調整 PDF 本身的縮放、畫筆模式與標註工具列行為;PDF 繪製寬度仍由論文區容器寬度決定。
- 不處理手機尺寸(小於 600px)的專屬版面,該範圍沿用堆疊配置並確保不橫向溢出。
- 不新增深色模式或變更全站色彩。

## Alternatives Considered

- **維持並排、只加寬翻譯欄(例如 1:1)**:直擺 820px 時論文區僅約 370px,PDF 文字過小,拒絕;因此直擺改為堆疊。
- **翻譯面板改為底部抽屜(bottom sheet)**:會遮住 PDF 頁面與畫筆工具列,且與 Apple Pencil 繪圖手勢可能衝突,拒絕。
- **只用 CSS 調整、不動 TranslationPanel**:可解決寬度與捲動,但「新譯文捲回頂端」「操作列固定」需要面板結構(操作列與結果區分離)與少量 ref 邏輯,故一併小幅調整元件。

## Capabilities

### New Capabilities

- `reader-layout`: 閱讀頁在不同視窗尺寸(含平板直擺/橫擺)的版面配置、翻譯面板的捲動方式與閱讀排版、下方筆記與心得區塊的行寬與間距。

### Modified Capabilities

(none)

## Impact

- Affected specs: reader-layout(新增);translation 與 pdf-reader 的既有需求不變。
- Affected code:
  - Modified: app/globals.css
  - Modified: app/library/[id]/page.tsx
  - Modified: components/TranslationPanel.tsx
  - Modified: components/TranslationPanel.test.tsx
  - Modified(僅在旋轉實測證明需要時): components/PdfViewer.tsx 與 components/PdfViewer.test.tsx
  - New: 無(僅新增 openspec/specs/reader-layout/spec.md,於封存時產生)
  - Removed: 無
