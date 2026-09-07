## Why

現有的免費論文閱讀平台在全文翻譯與筆記記錄的免費額度上都有限制,且筆記通常鎖在單一平台內。使用者希望有一套自己掌控、可在 iPad 上以 App 般體驗使用、筆記能跨裝置同步的個人論文閱讀工具,長期使用更可控、免受平台額度限制。

## What Changes

- 新增可在 iPad Safari 上安裝為主畫面 App 的 PWA 論文閱讀器(Next.js + next-pwa,部署於 Vercel)
- 新增 PDF 上傳、渲染與翻頁功能(pdf.js / react-pdf)
- 新增選取文字/整頁翻譯功能,透過伺服器端 API route 代理呼叫 DeepL,金鑰不外洩於前端
- 新增翻譯結果快取,避免重複消耗 DeepL 免費額度
- 新增使用者登入(Supabase Auth)與論文檔案雲端儲存(Supabase Storage)
- 新增筆記/高亮功能,綁定至論文頁面與選取範圍,寫入 Supabase Postgres 以達成跨裝置同步(iPad 與桌機瀏覽器皆可讀寫同一份筆記)
- 新增 PWA 安裝與離線唯讀支援,含 iOS 專屬 manifest/icon 設定與 service worker 快取策略

## Capabilities

### New Capabilities

- `pdf-reader`: PDF 檔案上傳、渲染與翻頁瀏覽
- `paper-library`: 使用者登入與論文檔案的雲端儲存/清單管理
- `translation`: 選取文字/整頁翻譯,含金鑰保護的伺服器代理與翻譯結果快取
- `reading-notes`: 綁定於論文頁面與選取範圍的筆記/高亮,跨裝置同步
- `pwa-shell`: PWA 安裝(iOS 主畫面)、manifest 設定與 service worker 快取策略

## Impact

- Affected code(全新專案,以下皆為新增檔案):
  - New:
    - next.config.js
    - public/manifest.json
    - app/layout.tsx
    - app/api/translate/route.ts
    - lib/supabase/client.ts
    - lib/supabase/schema.sql
    - components/PdfViewer.tsx
- Affected systems:
  - 部署:Vercel 免費方案(前端 + API routes)
  - 後端服務:Supabase 免費方案(Auth、Postgres、Storage)
  - 外部 API:DeepL 翻譯 API(需使用者自行申請金鑰,存於 Vercel 伺服器端環境變數)
