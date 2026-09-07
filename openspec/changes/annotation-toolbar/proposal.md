## Why

目前 Apple Pencil 畫記功能(`pencil-annotations`)只支援單一固定顏色、固定粗細的畫筆,且沒有橡皮擦——畫錯了只能清空整份筆記重畫。這讓實際做筆記(例如用不同顏色標示不同重點、畫細線標註公式、畫粗線框重點段落)很不方便,使用者已確認畫筆的基本輸入功能(觸控/Apple Pencil 都能畫線)已經正常運作,現在要補上工具列讓畫筆真正好用。

## What Changes

- 在畫筆模式的控制列新增一個簡易工具列:筆刷／橡皮擦兩種工具切換、顏色選擇(固定調色盤)、筆刷粗細選擇(固定幾種粗細)。
- 每一筆新畫的線(stroke)記錄當下選擇的顏色與粗細,並隨筆記一起儲存與讀回,重新整理後線條的顏色/粗細不變。
- 橡皮擦以「筆畫為單位」擦除:橡皮擦路徑碰到哪一筆線,就整筆刪除(不做像素級局部擦除),擦除後若該頁筆記已無任何筆畫,對應的筆記記錄一併移除。
- 新畫的線預設沿用上一筆選擇的顏色與粗細(重新整理頁面後重置為預設值即可,不需要跨 session 記住)。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `pencil-annotations`: 畫筆模式新增工具選擇(筆刷/橡皮擦)、每筆線條可指定顏色與粗細並持久化、橡皮擦以整筆線為單位刪除既有筆畫

## Impact

- Affected specs: pencil-annotations
- Affected code:
  - New:
    - components/AnnotationToolbar.tsx
    - components/AnnotationToolbar.test.tsx
    - lib/annotations/stroke-hit-test.ts
    - lib/annotations/stroke-hit-test.test.ts
  - Modified:
    - components/AnnotationCanvas.tsx
    - components/AnnotationCanvas.test.tsx
    - components/PdfViewer.tsx
    - components/PdfViewer.test.tsx
    - lib/annotations/queries.ts
    - lib/annotations/queries.test.ts
    - app/globals.css
