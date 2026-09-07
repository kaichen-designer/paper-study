## Why

單純打字做筆記,在標記重點、畫圖說明、快速塗鴉這類「輔助理解」的用途上不夠直覺。iPad 搭配 Apple Pencil 是使用者的主要閱讀裝置,支援手寫直接標記在論文頁面上,能讓「加深學習」這個核心目標更貼近使用者原本讀紙本論文畫重點的習慣。

## What Changes

- 在 PDF 閱讀畫面新增「畫筆模式」切換按鈕,開啟後可用 Apple Pencil(或手指)在當前頁面上手寫畫記,關閉時恢復原本的閱讀/選字/翻頁操作
- 畫記以向量筆跡資料儲存(每筆是一串座標點,含壓感),而非點陣圖片,並以相對頁面比例座標儲存,確保縮放後位置仍正確對齊
- 筆跡綁定特定論文與頁碼,跨裝置登入後可讀取到相同的畫記
- 不支援手寫辨識(OCR),畫記純粹是視覺標記/備忘用途,不會被轉成可搜尋文字
- 一則筆記記錄為純文字或純畫記其中一種,本次不支援同一則筆記混合文字與畫記

## Capabilities

### New Capabilities

- `pencil-annotations`: 在 PDF 頁面上以 Apple Pencil(或觸控)手寫畫記,並以向量筆跡資料持久化儲存

## Impact

- Affected code:
  - New:
    - components/AnnotationCanvas.tsx
    - lib/annotations/stroke-geometry.ts
    - lib/annotations/queries.ts
  - Modified:
    - components/PdfViewer.tsx(加入畫筆模式切換與疊加畫布)
    - lib/supabase/schema.sql(notes 表新增 strokes 欄位;既有 RLS 政策以 user_id 為範圍,新增欄位不需調整政策)
    - app/library/[id]/PaperReader.tsx(串接畫筆模式狀態)
- Affected systems:
  - 資料庫:Supabase Postgres(notes 表結構調整)
