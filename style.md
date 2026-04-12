# LURE Meta Platform — 樣式規範 Style Guide

## 色彩系統 Color System

### CSS 變數（:root）

| 變數名稱 | 色碼 | 用途 |
|---------|------|------|
| `--orange` | `#FF6B2C` | 主色、CTA、active 狀態、連結 |
| `--orange-dark` | `#E55A1C` | 主色 hover 態 |
| `--orange-bg` | `#FFF5F0` | 淡橘底色（hover、active 背景）|
| `--orange-border` | `#FFE8D9` | 橘色邊框 |
| `--orange-muted` | `#B07A50` | 橘色低調文字 |
| `--black` | `#1A1A1A` | 主文字色 |
| `--gray-500` | `#666666` | 次要文字、說明 |
| `--gray-300` | `#AAAAAA` | 輔助文字、placeholder、label |
| `--warm-white` | `#FAFAFA` | 頁面背景 |
| `--white` | `#FFFFFF` | 卡片、面板、輸入框背景 |
| `--border` | `#F0F0F0` | 標準邊框 |
| `--border-strong` | `#E0E0E0` | 強調邊框 |
| `--green` | `#2E7D32` | 進行中、成功、正向 |
| `--green-bg` | `#E8F5E9` | 綠色底色 |
| `--red` | `#C62828` | 錯誤、已刪除、危險 |
| `--red-bg` | `#FFEBEE` | 紅色底色 |
| `--yellow` | `#E65100` | 警示、暫停 |
| `--yellow-bg` | `#FFF3E0` | 黃色底色 |

### 語意色彩使用規則

- **主色橘**：按鈕 CTA、active nav、focus 邊框、badge、強調
- **綠色**：進行中廣告（ACTIVE）、成功訊息、指示燈 on
- **黃色**：暫停廣告（PAUSED）、警示項目
- **紅色**：已刪除廣告（DELETED）、錯誤狀態
- **灰色**：停用帳戶、指示燈 off、輔助說明

---

## 字體 Typography

### 字型

```css
font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- Google Fonts CDN：`Noto Sans TC` weight 400 / 500 / 600 / 700
- 備用：系統預設 sans-serif

### 字級規格

| 層級 | font-size | font-weight | 用途 |
|------|-----------|-------------|------|
| 頁面標題 | 16px | 700 | `.page-title`，topbar 左側 |
| 卡片標題 | 13–14px | 700 | 卡片 header、section 標題 |
| 主文字 | 14px | 400–500 | body 基準 |
| 表格文字 | 13px | 400 | `.tree`、`.finance-table` |
| 次要文字 | 12px | 500 | 帳戶列表名稱 |
| 輔助標籤 | 11px | 600 | 大寫欄位標題、KPI label |
| 極小文字 | 10px | 600 | nav section 標題 |
| 數字顯示 | 22–28px | 700 | KPI 數值 |

### 數字格式

```css
font-variant-numeric: tabular-nums;  /* 所有數字欄一致 */
letter-spacing: -0.5px;              /* 大數字 */
```

---

## 圓角 Border Radius

| 變數 | 數值 | 用途 |
|------|------|------|
| `--radius` | `12px` | 卡片、modal、下拉選單 |
| `--radius-sm` | `8px` | 輸入框、小元件 |
| `--radius-pill` | `50px` | 按鈕（全圓角膠囊形）、badge |

- 大卡片用 `16px`（stats、tree-wrap、chart card）
- 登入卡片用 `24px`
- Avatar 用 `50%`（圓形）

---

## 陰影 Shadow

| 變數 | 數值 | 用途 |
|------|------|------|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.06)` | 小元件懸浮 |
| `--shadow-md` | `0 4px 24px rgba(0,0,0,0.08)` | modal、dropdown、側邊面板 |

---

## 間距 Spacing

| 層級 | 數值 | 用途 |
|------|------|------|
| 頁面 padding | `24px` | topbar、主內容區 |
| 面板 padding | `16px` | 側邊面板、卡片 |
| 卡片 padding | `12–16px` | 列表 item、表格 cell |
| 小間距 | `8–10px` | 相鄰元件 gap |
| gap 標準 | `12px` | 卡片 grid gap |

---

## 版面結構 Layout

### 整體

```
[左側導覽列 220px / fixed] [主內容區 flex:1]
```

- `--sidebar-w: 220px`
- Topbar 高度：60px
- 主內容：`margin-left: 220px`，flex column，overflow hidden

### 左側導覽列

- Logo 區：60px 高，含 LURE META 品牌文字
- Nav 項目：`padding: 11px 14px`，圓角 12px，hover/active = 橘底橘字
- 底部用戶區：`margin-top:auto`，border-top，無邊框無 hover 效果
  - 用戶下拉選單：往**上**開啟（`bottom: calc(100% + 8px)`）

### Topbar

- 60px 高，white 背景，底部 1px border + box-shadow
- 左：頁面標題
- 右：DatePicker（有日曆 icon，**無箭頭**）、分隔線、重新整理按鈕

### 雙欄面板（Dashboard / 關注名單 / Finance / Settings）

| 頁面 | 左欄寬度 | 右欄 |
|------|---------|------|
| 儀表板 | 240px | stats + 樹狀表格 |
| 關注名單 | 240px（dash-acct-item 樣式）| 三卡並排 |
| 財務專區 | 480px（帳戶列表）| toolbar + 行銷活動表格 |
| 設定 | 260px | 帳戶管理面板 |

---

## 元件規範 Components

### 按鈕 Button

```css
.btn        /* 基底：height 36px, padding 0 18px, radius pill, flex */
.btn-blue   /* CTA：橘底白字 */
.btn-ghost  /* 次要：透明底、border、hover 橘底 */
.btn-red    /* 危險：淡紅底紅字 */
.btn-sm     /* 小尺寸：height 30px, padding 0 14px, font 12px */
```

- 重新整理圖示按鈕：`class="btn btn-ghost btn-sm"`，顯示 `↻`，font-size 16px，padding 0 10px
- **禁止**：在按鈕上直接寫 inline style 改變顏色，統一用 class

### Checkbox

```css
.custom-cb   /* 所有 checkbox 統一使用此 class */
```

- 勾選後：橘底（`var(--orange)`）+ 白色打勾（`::after` 偽元素）
- **禁止**：使用 `accent-color` inline style
- 尺寸：預設 `16x16px`；小版（表格內）可用 `13x13px` via inline style

### 狀態徽章 Badge

```css
.badge          /* 基底：inline-flex, padding 2px 8px, radius pill, font 11px 600 */
.badge-active   /* 綠底綠字 */
.badge-paused   /* 黃底黃字 */
.badge-other    /* 紅底紅字（已封存、已刪除）*/
```

財務專區狀態文字樣式：
- 進行中：`color: var(--green); font-weight: 600`
- 暫停：`color: var(--gray-300)`
- 已封存：`color: var(--gray-300); opacity: 0.6`
- 已刪除：`color: var(--red)`

### Toggle 開關

```css
.toggle   /* 32x18px，橘色 checked */
.slider   /* 圓形滑塊，checked 時 translateX(14px) */
```

- 切換狀態前必須跳 `confirm()` 確認對話框

### 帳戶列表項目 dash-acct-item

```css
.dash-acct-item     /* flex, padding 8px 12px, 底線, 可點擊 */
.dash-acct-dot      /* 8x8px 圓點 */
.dash-acct-dot.on   /* 綠色：帳戶進行中 */
.dash-acct-dot.off  /* 灰色：帳戶停用 */
.dash-acct-name     /* 12px 500，超出省略 */
.dash-acct-item.active .dash-acct-name  /* 橘色 600 */
```

- 適用：儀表板、關注名單（所有帳戶選擇列表統一使用此樣式）

### 樹狀表格 Tree Table

```css
table.tree th   /* sticky top, warm-white 背景, uppercase label */
table.tree td   /* padding 10px 14px, border-bottom */
.campaign-row   /* level 0, 白底, 粗體名稱 */
.adset-row      /* level 1, #FFFCFA 底 */
.ad-row         /* level 2, 白底 */
```

縮排：`.indent-0` / `.indent-1` (24px) / `.indent-2` (48px)

### 財務表格 Finance Table

```css
.finance-table th   /* sticky, warm-white, uppercase 11px */
.finance-table td   /* padding 9px 12px */
.finance-table td.num  /* 靠右對齊，tabular-nums */
```

- **花費欄（花費）左對齊**（不加 `class="num"`）
- 月% 和 花費+% 靠右（`class="num"`）

### 卡片 Card

```css
.ai-kpi-card     /* KPI 數值卡片：white, border, radius 16px, padding 18px 20px */
.ai-chart-card   /* 圖表卡片：white, border, radius 16px, padding 20px */
.ai-text-card    /* 文字卡片：左側 4px 色邊框 */
.stat            /* 儀表板 stat 卡片：padding 16px 20px, radius 16px */
```

### DatePicker

- 觸發器（`.dp-trigger`）：有日曆 icon（橘色 SVG），**無箭頭**
- 下拉面板：左側預設快選（150px），右側月曆（268px+）
- 自訂區間：from/to 日期選擇器，Apply 按鈕
- 每個頁面各有獨立 DatePicker 實例（`dpDash`、`dpAi`、`dpAlert`、`dpFin`）

### Modal

```css
.overlay   /* fixed inset, rgba 背景, flex center */
.modal     /* white, radius 12px, padding 24px, width 360px */
```

### Loading / Empty

```css
.loading      /* flex center, padding 60px, spinner + 文字 */
.spinner      /* 18x18px, border-top 橘色, animation spin */
.empty-state  /* padding 60px, center, gray-300 */
```

---

## 數據分析圖表 Charts

- 使用 **Chart.js 4.4.0** + **chartjs-plugin-datalabels 2.2.0**（CDN 載入）
- 一列三個卡片（Grid：`repeat(3, 1fr)`）
- RWD：≤1200px → 兩列；≤768px → 單列
- Bar chart：datalabels 顯示數值在 bar 頂端
- CTR 分布：排除 0% bucket

---

## 關注名單 Alert Cards

三張並排卡片，各有獨立欄位與排序狀態：

| 卡片 | 標題色 | 欄位 | 篩選器 |
|------|--------|------|--------|
| 私訊成本過高 | `#FF6B2C` | 行銷活動、花費、私訊數、私訊成本 | 只顯示標題含私訊（預設開）|
| CPC 過高 | `#F59E0B` | 行銷活動、CPC | 隱藏標題含私訊（預設開）|
| 頻次過高 | `#8B5CF6` | 行銷活動、頻次 | 無 |

**門檻（固定值）：**
- 私訊成本 > $200：過高（優先）
- 私訊成本 $150–200：偏高（警示）
- CPC > $5：過高（優先）
- CPC $4–5：偏高（警示）
- 頻次 > 5（花費 > $1,000）：過高
- 頻次 3–5（花費 > $500）：偏高

---

## RWD 斷點 Breakpoints

| 斷點 | 說明 |
|------|------|
| ≤ 1200px | 圖表改 2 列 |
| ≤ 768px | 側欄隱藏（hamburger）、雙欄改單欄、帳戶列表改橫向捲動 |
| ≤ 480px | stats grid 改 3 欄，文字縮小 |

---

## 禁止事項 Do Not

- 不使用 `accent-color` inline style 於 checkbox（一律 `.custom-cb`）
- 不在按鈕上使用 `emoji`
- 不在 DatePicker 觸發器上顯示箭頭（`dp-arrow` 已保留 CSS 但 HTML 不輸出）
- 不使用 `str | None` Python 型別語法（Python 3.9，用 `Optional[str]`）
- `getMsgCount` 必須是 global function，不可定義在任何 function 內部
- 不使用 `onsite_conversion.total_messaging_connection`（會重複計算）
- 不在 Finance 花費欄加 `class="num"`（花費要左對齊）
- 切換開關、調整預算前必須有 `confirm()` 確認視窗
