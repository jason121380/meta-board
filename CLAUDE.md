# CLAUDE.md — LURE Meta Platform

## Project Overview

Facebook Ads management dashboard for LURE agency. FastAPI backend + single-page HTML frontend.
Connects to Facebook Marketing API v21.0 to manage 80+ ad accounts across multiple Business Managers.

## Branding

- Product: **LURE META PLATFORM**
- Colors: Orange `#FF6B2C` (primary), `#FFF5F0` (light bg / warm-white), `#FFE8D9` (border)
- Font: Noto Sans TC
- Reference design: https://github.com/jason121380/Google-My-Business

## Tech Stack

- **Backend**: Python 3.9 / FastAPI / httpx (async)
- **Frontend**: Vanilla JS, single `dashboard.html` (no build step)
- **Charts**: Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 (CDN)
- **Auth**: Facebook JS SDK (browser) + FastAPI token endpoint (server)
- **AI**: Google Gemini API (optional, for AI recommendations)
- **DB**: PostgreSQL via asyncpg (optional, for user settings sync)

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, all API routes |
| `dashboard.html` | Full SPA frontend (login + all views) |
| `static/manifest.json` | PWA manifest |
| `static/sw.js` | Service worker |
| `.env` | FB + Gemini credentials (never commit) |
| `.env.example` | Template for credentials |
| `MEMORY.md` | Project context, known issues, architecture decisions |

## Environment Variables

```
FB_APP_ID       — Facebook App ID (2780372365654462)
FB_APP_SECRET   — Facebook App Secret
FB_ACCESS_TOKEN — Long-lived user access token (fallback, overridden by FB Login)
FB_API_VERSION  — Graph API version (default: v21.0)
GEMINI_API_KEY  — Google Gemini API key (for AI recommendations)
GEMINI_MODEL    — Gemini model (default: gemini-3-flash-preview)
DATABASE_URL    — PostgreSQL connection string (optional)
```

## Token Flow

1. User visits `/` → sees login page
2. Clicks FB Login → FB OAuth popup → gets token
3. Browser POSTs token to `/api/auth/token`
4. Server stores in `_runtime_token` (overrides .env token)
5. All API calls use `get_token()` which prefers runtime token

Required FB scopes: `ads_read`, `ads_management`, `business_management`

## Running Locally

```bash
python main.py          # port 8001
# or
uvicorn main:app --port 8001 --reload
```

## Views / Layout Structure

```
[Left Sidebar 220px - fixed]
  Logo: LURE META
  Nav: 儀表板 | 數據分析 | 關注名單 | 財務專區 | 快速上架 | 設定
  Bottom: User avatar (no border, no hover, no arrow — dropdown opens upward)

[Main Content]
  [Topbar 60px — date picker + controls]
  [View-specific body]
```

### Dashboard view
```
[Account List 240px] | [Topbar: date + filter]
                       [Stats row: spend/impressions/clicks/CTR/CPC/CPM/freq/msg]
                       [Tree table: Campaign → Adset → Ad (3 levels)]
```

### 關注名單 (Alert/Watch List)
```
[Account List 240px] | [3 side-by-side cards]
  dash-acct-item style  私訊成本過高 | CPC過高 | 頻次過高
  全部帳戶 + per-account  sortable headers, keyword filters
```

### Finance view
```
[Account List 160px] | [Toolbar: search + filter + markup]
                        [Campaign table: No.|狀態|名稱|花費|月%|花費+%|Pin]
```

### Settings view
Same two-column: account list | detail panel

## Account Selection Logic

- `savedSelectedIds` (localStorage: `fb_selected_accounts`) = accounts enabled in Settings
- `selectedAccounts` (localStorage: `fb_active_accounts`) = accounts active in dashboard
- Dashboard left panel only shows accounts that are in `savedSelectedIds` (if any configured)
- `getVisibleAccounts()` returns accounts sorted by `acctOrder`

## Common Patterns

### Backend
- All FB API calls: `fb_get()` or `fb_post()` helpers in main.py
- Pagination: `get_accounts()` follows `paging.next` in while loop
- Budget values: × 100 when sending (cents), ÷ 100 when displaying
- Account IDs include `act_` prefix (e.g. `act_123456`)

### Frontend
- Date params: `_insights_clause()` builds `insights.date_preset(X){fields}` or `insights.time_range(X){fields}`
- Cache: `_cacheGet/Set(type, acctId, dateParam)` — in-memory, cleared on date change
- `getIns(c)` extracts the `insights.data[0]` object from a campaign/adset/ad
- `getMsgCount(c)` — **global function** (not local to any view) — reads `onsite_conversion.messaging_conversation_started_7d` or `messaging_conversation_started_7d` from `actions[]`, first-found to avoid double counting. Never use `total_messaging_connection`.
- `fM(v)` formats money (comma separator), `fP(v)` formats percentage, `fN(v)` formats integer count

### Ad tree (Dashboard)
- `adData[adsetId]`: `undefined` = not fetched, `null` = error, `[]` = empty, `[...]` = loaded
- `expandedAdsets` Set tracks which adsets are expanded
- `toggleAdset(id)` handles fetch + expand/collapse

### Alert cards
- `_alertRows`, `_alertSort`, `_alertCols`, `_alertFilter` — module-level state
- `alertSortBy(cardKey, colLabel)` — toggles sort direction
- `alertFilterToggle(cardKey)` — toggles keyword filter
- `_renderAlertCardRows(cardKey)` + `_renderAlertCardHead(cardKey)` — re-render without full page reload
- IDs: `alert-thead-msg`, `alert-tbody-msg`, `alert-thead-cpc`, etc.

### Checkboxes
All checkboxes use `.custom-cb` class for consistent white-checkmark-on-orange style.
Do NOT use `accent-color` inline style — always use the `custom-cb` class.

## Alert Thresholds

| Code | Category | Trigger |
|------|----------|---------|
| P1 | CPC過高 | CPC > avgCpc × 3, spend > $5,000 |
| P2 | 私訊成本過高 | msgCost > avgMsgCost × 3, has msg data |
| P3 | CPC過高 | CPC > avgCpc × 2, spend > $3,000 |
| P4 | 頻次過高 | frequency > 7 |
| W1 | CTR偏低 | CTR < 0.5%, spend > $3,000 |
| W2 | CTR偏低 | CTR < 1%, spend > $10,000 |
| W3 | CPC偏高 | CPC > avgCpc × 1.5 |
| W4 | 頻次偏高 | frequency > 5 |
| W5 | 私訊成本偏高 | msgCost > avgMsgCost × 2 |

## Do Not

- Commit `.env`
- Add a build step — keep frontend as single HTML file
- Use sync httpx — all FB calls must be async
- Use `str | None` syntax (Python 3.9 — use `Optional[str]` from typing)
- Add emojis to the UI
- Define `getMsgCount` locally inside a function — it must remain a global function
- Use `onsite_conversion.total_messaging_connection` for message counting (double-counts)
- Use `accent-color` on checkboxes — always use `class="custom-cb"`
