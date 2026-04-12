# Meta Board — FB Ads Dashboard

Facebook 廣告管理後台，串接 Facebook Marketing API，支援多帳戶管理、AI 廣告分析、快速上架。

## 功能

- **儀表板** — 多廣告帳戶加總成效（花費、曝光、點擊、CTR、CPC、CPM）
- **樹狀表格** — 行銷活動 → 廣告組合 → 廣告，點擊展開
- **AI 廣告分析** — 自動產生高花費、低 CTR、高 CTR 洞察卡片
- **快速上架** — 三步驟建立行銷活動精靈
- **設定** — 管理要顯示的廣告帳戶
- **Facebook 登入** — 透過 FB JS SDK 登入，無需手動填 token

## 環境需求

- Python 3.9+
- Facebook App（需有 `ads_read` 權限）

## 安裝

```bash
pip install -r requirements.txt
```

## 設定

複製 `.env.example` 為 `.env`，填入你的 Facebook 憑證：

```bash
cp .env.example .env
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
| GET | `/api/accounts` | 取得所有廣告帳戶 |
| GET | `/api/accounts/{id}/campaigns` | 取得行銷活動 |
| GET | `/api/accounts/{id}/insights` | 帳戶整體成效 |
| GET | `/api/campaigns/{id}/adsets` | 取得廣告組合 |
| GET | `/api/adsets/{id}/ads` | 取得廣告 |
| POST | `/api/campaigns/{id}/status` | 開啟/暫停行銷活動 |
| POST | `/api/quick-launch/campaign` | 快速建立行銷活動 |
| POST | `/api/auth/token` | 設定 FB access token |
| DELETE | `/api/auth/token` | 清除 token（登出） |
