# LURE Meta Platform

Facebook 廣告管理後台，串接 Facebook Marketing API，支援多帳戶管理、AI 廣告分析、快速上架。

設計風格參考：[Google-My-Business](https://github.com/jason121380/Google-My-Business)

## 功能

- **儀表板** — 左側帳戶選擇，右側即時成效數據（花費、曝光、點擊、CTR、CPC、CPM 等）
- **樹狀表格** — 行銷活動 → 廣告組合 → 廣告，點擊展開
- **AI 廣告分析** — 自動產生高消耗、低 CTR、高效能等洞察卡片
- **快速上架** — 三步驟建立行銷活動精靈
- **設定** — 主從式雙欄介面，管理要顯示的廣告帳戶（勾選後存檔即生效）
- **Facebook 登入** — 透過 FB JS SDK 登入，token 存於伺服器記憶體

## 環境需求

- Python 3.9+
- Facebook App（需有 `ads_read`、`ads_management`、`business_management` 權限）

## 安裝

```bash
pip install -r requirements.txt
```

## 設定

```bash
cp .env.example .env
# 填入 FB_APP_ID、FB_APP_SECRET、FB_ACCESS_TOKEN
```

## 啟動

```bash
python main.py
# 或
uvicorn main:app --port 8001 --reload
```

開啟瀏覽器：http://localhost:8001

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/accounts` | 取得所有廣告帳戶（分頁） |
| GET | `/api/accounts/{id}/campaigns` | 取得行銷活動 |
| GET | `/api/accounts/{id}/insights` | 帳戶整體成效 |
| GET | `/api/campaigns/{id}/adsets` | 取得廣告組合 |
| GET | `/api/adsets/{id}/ads` | 取得廣告 |
| POST | `/api/campaigns/{id}/status` | 開啟/暫停行銷活動 |
| POST | `/api/campaigns/{id}/budget` | 更新行銷活動預算 |
| POST | `/api/adsets/{id}/status` | 開啟/暫停廣告組合 |
| POST | `/api/quick-launch/campaign` | 快速建立行銷活動 |
| POST | `/api/auth/token` | 設定 FB access token |
| DELETE | `/api/auth/token` | 清除 token（登出） |
| GET | `/api/auth/me` | 取得目前登入用戶資訊 |

## 注意事項

- `.env` 已排除於 git，憑證不會上傳
- 企業管理平台欄位需要 token 包含 `business_management` scope 才會回傳
- 個人廣告帳號（非 Business Manager 下）不會有企業管理平台資訊
