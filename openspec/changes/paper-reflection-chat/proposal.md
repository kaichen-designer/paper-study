## Why

現有的翻譯與筆記功能能幫助理解單一段落,但不足以確認「有沒有真的讀懂整篇論文」。使用者提出的核心需求是:讀完後用自己的話寫下心得,再由 AI 根據論文原文內容給出回饋、指出理解錯誤或漏採的重點,透過對話反覆加深印象,呼應這個專案最初「AI 興盛讓學習不夠紮實」的動機。

## What Changes

- 每篇論文新增一個持續累積的「心得對話」功能,使用者可在任何時候(不限讀完才能用)輸入對這篇論文的心得或想法
- AI(沿用既有的 Gemini API)回應時會帶入論文全文文字作為背景,針對使用者的心得給出具體回饋,包含指出理解有誤或遺漏的重點
- 對話記錄持久化儲存,重新整理頁面或下次登入後回到同一篇論文仍可看到先前的對話並繼續
- 新增「抽取論文全文文字」的能力(逐頁遍歷 PDF 取得所有文字內容),供對話功能取用;此能力也可供未來其他功能重用

## Non-Goals

- 不做多篇論文之間的交叉比較對話(每個對話只針對單一論文)
- 不做對話內容的自動摘要或評分機制,回饋完全由 AI 生成的自然語言文字呈現
- 不最佳化重複傳送論文全文造成的 token 消耗(見 design.md 的已知取捨),留待實際遇到額度問題再處理

## Capabilities

### New Capabilities

- `paper-reflection-chat`: 針對單篇論文的持續性心得對話,AI 回應時參照論文全文內容給出具體回饋

## Impact

- Affected code:
  - New:
    - lib/pdf/extract-full-text.ts
    - lib/reflection/queries.ts
    - lib/reflection/generate-reply.ts
    - app/api/reflect/route.ts
    - components/ReflectionChat.tsx
  - Modified:
    - lib/supabase/schema.sql(新增 `reflection_messages` 資料表與 RLS 政策)
    - app/library/[id]/PaperReader.tsx(串接對話面板)
    - components/PdfViewer.tsx(新增全文抽取所需的頁面文字讀取介面)
- Affected systems:
  - 資料庫:Supabase Postgres(新增資料表)
  - 外部 API:Gemini API(既有整合,新增一支呼叫路徑)
