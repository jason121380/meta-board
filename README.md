# LURE Meta Platform

Facebook 廣告管理後台，串接 Facebook Marketing API v21.0，支援 80+ 廣告帳戶管理、AI 廣告分析、財務試算、快速上架。

設計風格參考：[Google-My-Business](https://github.com/jason121380/Google-My-Business)

---

## 功能總覽

### 儀表板（Dashboard）
- 左側帳戶選擇面板（支援多選、拖曳排序）
- 右側即時成效數據：花費、曝光、點擊、CTR、CPC、CPM、頻次、私訊數
- 樹狀三層表格：行銷活動 → 廣告組合 → 廣告（點擊展開）
- 篩選：只顯示有花費的活動
- 日期區間：預設區間選擇 + 自訂日期範圍
- 開關活動/廣告組合狀態、調整預算

### 數據分析（AI Analytics）
- 帳戶整體 KPI：總花費、進行中活動數、平均 CTR、平均 CPC、總私訊數、平均私訊成本
- 11 個 Chart.js 圖表（每列 3 個，RWD 自適應）：
  - 各帳戶花費分布、私訊數、各帳戶私訊成本
  - CTR 分布區間（0% 自動排除）
  - 花費 vs 私訊成本散點圖
  - 私訊成本分布、最佳效率活動、頻次分布
  - 私訊數 vs ROI 效率
  - 有/無私訊數據比例（甜甜圈圖）
  - 各帳戶私訊佔比（甜甜圈圖）
- 使用 chartjs-plugin-datalabels 在 bar 上直接顯示數值

### 關注名單（原 AI警示建議）
- 左側廣告帳戶選擇面板（全部 / 單一帳戶過濾）
- 三張並排卡片：**私訊成本過高**、**CPC 過高**、**頻次過高**
  - 私訊成本過高：欄位「行銷活動、花費、私訊數、私訊成本」+ checkbox「隱藏標題含流量」（預設勾選）
  - CPC 過高：欄位「行銷活動、CPC」+ checkbox「隱藏標題含私訊」（預設勾選）
  - 頻次過高：欄位「行銷活動、頻次」
  - 各卡片欄位標題可點擊排序（升/降序）
- 異常判定門檻：
  - P1: CPC > 均值 × 3（花費 > $5,000）
  - P2: 私訊成本 > 均值 × 3（有私訊數據）
  - P3: CPC > 均值 × 2（花費 > $3,000）
  - P4: 頻次 > 7
  - W1: CTR < 0.5%（花費 > $3,000）
  - W2: CTR < 1%（花費 > $10,000）
  - W3: CPC > 均值 × 1.5
  - W4: 頻次 > 5
  - W5: 私訊成本 > 均值 × 2

### 財務專區（Finance）
- 左側帳戶列表 + 花費摘要
- 右側按帳戶或行銷活動列表（支援月%加成計算）
- 行銷活動表格欄位：No.、狀態（進行中/暫停/封存）、行銷活動名稱、花費、月%、花費+%、Pin
- 匯出 CSV（當前視圖）
- 篩選：只顯示有花費

### 快速上架（Quick Launch）
- 三步驟建立行銷活動：選帳戶 → 設定名稱/目標 → 確認建立

### 設定（Settings）
- 雙欄介面：左側帳戶總列表，右側啟用狀態管理
- 已選帳戶存入 localStorage + 可同步 PostgreSQL
- 排序拖曳（acctOrder）

---

## 技術架構

| 層 | 說明 |
|----|------|
| Backend | Python 3.9 / FastAPI / httpx (async) |
| Frontend | 單一 `dashboard.html`（Vanilla JS，無 build step）|
| Auth | Facebook JS SDK (browser) + `/api/auth/token` (server) |
| Charts | Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 |
| AI | Google Gemini API (generativelanguage.googleapis.com) |
| DB | PostgreSQL（選用，用於雲端同步用戶設定）|
| Port | 8001 |

---

## 環境需求

- Python 3.9+
- Facebook App（需有 `ads_read`、`ads_management`、`business_management` 權限）
- Gemini API Key（選用，關注名單 AI 建議功能）
- PostgreSQL（選用，用戶設定雲端同步）

---

## 安裝與啟動

```bash
# 安裝套件
pip install -r requirements.txt

# 設定環境變數
cp .env.example .env
# 填入 FB_APP_ID、FB_APP_SECRET、FB_ACCESS_TOKEN 等

# 啟動
python main.py
# 或
uvicorn main:app --port 8001 --reload
```

開啟瀏覽器：http://localhost:8001

---

## 環境變數

| 變數 | 說明 |
|------|------|
| `FB_APP_ID` | Facebook App ID（`2780372365654462`）|
| `FB_APP_SECRET` | Facebook App Secret |
| `FB_ACCESS_TOKEN` | 長效用戶 token（備用，登入後以 runtime token 覆蓋）|
| `FB_API_VERSION` | Graph API 版本（預設 `v21.0`）|
| `GEMINI_API_KEY` | Google Gemini API Key |
| `GEMINI_MODEL` | Gemini 模型名稱（預設 `gemini-3-flash-preview`）|
| `DATABASE_URL` | PostgreSQL 連線字串（選用）|

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/accounts` | 取得所有廣告帳戶（分頁）|
| GET | `/api/accounts/{id}/campaigns` | 取得行銷活動（含 insights）|
| GET | `/api/accounts/{id}/insights` | 帳戶整體成效 |
| GET | `/api/campaigns/{id}/adsets` | 取得廣告組合 |
| GET | `/api/adsets/{id}/ads` | 取得廣告（含 creative）|
| POST | `/api/campaigns/{id}/status` | 切換行銷活動狀態 |
| POST | `/api/campaigns/{id}/budget` | 更新行銷活動預算 |
| POST | `/api/adsets/{id}/status` | 切換廣告組合狀態 |
| POST | `/api/adsets/{id}/budget` | 更新廣告組合預算 |
| POST | `/api/ads/{id}/status` | 切換廣告狀態 |
| POST | `/api/quick-launch/campaign` | 快速建立行銷活動 |
| POST | `/api/auth/token` | 設定 FB access token |
| DELETE | `/api/auth/token` | 清除 token（登出）|
| GET | `/api/auth/me` | 取得目前登入用戶資訊 |
| GET | `/api/settings/{user_id}` | 取得用戶設定（PostgreSQL）|
| POST | `/api/settings/{user_id}` | 儲存用戶設定（PostgreSQL）|
| POST | `/api/ai/chat` | Gemini AI 對話 |

---

## 注意事項

- `.env` 已排除於 git，憑證不會上傳
- 企業管理平台欄位需要 token 包含 `business_management` scope
- Python 3.9 — 使用 `Optional[str]` 而非 `str | None` 語法
- 私訊數使用 `onsite_conversion.messaging_conversation_started_7d`（不使用 `total_messaging_connection`，避免重複計算）
- 預算值：傳送時 × 100（分），顯示時 ÷ 100
- 帳戶 ID 包含 `act_` 前綴（例如 `act_123456`）
