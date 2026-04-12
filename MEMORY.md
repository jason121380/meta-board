# Project Memory — LURE Meta Platform

## Branding

- Product name: **LURE META PLATFORM**
- GitHub repo: https://github.com/jason121380/meta-board
- Design: Orange (#FF6B2C) system, matches Google-My-Business repo style
- Font: Noto Sans TC

## FB App

- App ID: `2780372365654462` (hardcoded in dashboard.html FB JS SDK init)
- API Version: `v21.0`
- Token type: Long-lived user token (60 days), stored in `.env` as fallback
- Runtime token: stored in `_runtime_token` (set via FB Login, overrides .env)
- Required scopes: `ads_read`, `ads_management`, `business_management`
- Note: `business` field on ad accounts requires `business_management` scope. The `.env` token may lack this — user re-logs via FB Login to get updated scopes.

## Ad Accounts

- Jason has 80+ ad accounts across multiple Business Managers
- All loaded via paginated `/me/adaccounts` endpoint
- Settings page: check accounts to show in dashboard left panel
- Dashboard left panel: click account to toggle into active view
- Two separate localStorage keys:
  - `fb_selected_accounts` = accounts enabled in settings
  - `fb_active_accounts` = accounts currently selected in dashboard

## Architecture

- **Backend**: FastAPI (Python 3.9), port 8001
- **Frontend**: Single HTML file (`dashboard.html`), no build step
- **Auth**: FB JS SDK (browser) → `POST /api/auth/token` → `_runtime_token` in memory
- **Charts**: Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 (CDN, loaded in head)
- **AI**: Google Gemini API via `/api/ai/chat` endpoint
- **DB**: PostgreSQL via asyncpg — optional, used only for user settings sync

## Layout

- Left sidebar: 220px fixed, flex-column, user avatar at bottom (no border/hover/arrow, dropdown opens upward)
- Dashboard view: account list 240px | stats + 3-level tree table
- 關注名單 view: account list 240px (dash-acct-item style) | 3 side-by-side alert cards
- Finance view: account list 160px | toolbar + campaign table
- Settings view: account list | detail panel
- Topbar: 60px, contains date picker + view-specific controls

## Views Renamed

- "AI警示建議" → **關注名單** (as of 2026-04-12)

## Private Message Counting (Critical)

- Use `onsite_conversion.messaging_conversation_started_7d` OR `messaging_conversation_started_7d`
- Use first-found logic (stop at first match) to avoid double counting
- **Never** use `onsite_conversion.total_messaging_connection` — it counts total connections, not conversations started, and inflates numbers
- `getMsgCount(c)` is a **global function** defined at module level in dashboard.html — never redefine it locally inside a function

## Private Message Cost (Critical)

- `avgCostPerMsg = msgSpend / totalMsg`
- `msgSpend` = sum of spend from campaigns that HAVE message data (getMsgCount > 0)
- Do NOT use total account spend as denominator — it inflates cost

## Alert Cards (關注名單)

Three side-by-side cards, each with its own column set and sort state:
- **私訊成本過高**: 行銷活動, 花費, 私訊數, 私訊成本 + checkbox「隱藏標題含流量」
- **CPC過高**: 行銷活動, CPC + checkbox「隱藏標題含私訊」
- **頻次過高**: 行銷活動, 頻次

Module-level state: `_alertRows`, `_alertSort`, `_alertCols`, `_alertFilter`
DOM IDs: `alert-thead-{msg|cpc|freq}`, `alert-tbody-{msg|cpc|freq}`
Sorting: `alertSortBy(cardKey, colLabel)` — click header to sort, click again to reverse

## Finance Table

Columns (when single account selected / campaign drill-down mode):
`No. | 狀態 | 行銷活動名稱 | 花費 | 月% | 花費+% | Pin`

- 花費 is left-aligned (no `class="num"`)
- 狀態 shows coloured badges: 進行中 (green), 暫停 (gray), 已封存 (light gray), 已刪除 (red)
- KPI row (總花費/總花費+%) removed from Finance view as of 2026-04-12

## Checkbox Style

All checkboxes must use `class="custom-cb"` — never use `accent-color` inline style.
CSS: `.custom-cb:checked` = orange bg, white checkmark via `::after` pseudo-element.

## CTR Distribution Chart

Excludes 0% bucket — only shows campaigns with CTR > 0.

## Dashboard Account Panel

- No search box (removed 2026-04-12)
- No account count label (removed 2026-04-12)

## Server

- Port: `8001`
- Python 3.9 — use `Optional[str]` not `str | None`

## GitHub

- Repo: https://github.com/jason121380/meta-board
- Branch: `main`
- `.env` excluded from git (`.gitignore`)

## Known Issues / Notes

- `business` field on ad accounts: needs `business_management` in token scope
- Personal ad accounts (not in any Business Manager) will never return a business field
- 3rd level ads (adset → ads): loading works when server is running latest code; ensure server is restarted after deploy
- `getMsgCount` must be global — if defined locally inside a function, other module-level helpers (`_alertRowCtx`) will throw ReferenceError and alert cards will be blank
