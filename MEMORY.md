# Project Memory — LURE Meta Platform

## Branding

- Product name: **LURE META PLATFORM**
- GitHub repo: https://github.com/jason121380/meta-board
- Design: Orange (#FF6B2C) system, matches Google-My-Business repo style
- Font: Noto Sans TC

## FB App

- App ID: `2780372365654462` (hardcoded in `frontend/src/auth/FbAuthProvider.tsx`)
- API Version: `v21.0`
- Token type: Long-lived user token (60 days), stored in `.env` as fallback
- Runtime token: stored in `_runtime_token` (set via FB Login, overrides .env)
- Requested scopes (from `FB_SCOPES` in FbAuthProvider.tsx):
  - `ads_read`, `ads_management` — read campaigns / insights / creatives, toggle status, edit budget
  - `business_management` — read the `business` field on `/me/adaccounts` (needed for Ads Manager deep-link URLs)
  - `pages_read_engagement` — **added 2026-04-15**. Optional; grants read access to page post content (`full_picture`, `attachments.media.source`). See the "Page post scope behavior matrix" below for what it does to `/api/posts/{id}/media` and `/api/pages/{id}/info`.

### Page post scope behavior matrix

| Who is logging in | FB grants the scope? | `/api/posts/{id}/media` works? | Result in CreativePreviewModal |
|---|---|---|---|
| App admin / dev / tester (app role assigned in FB dev portal) | **Yes** — dev mode grants unreviewed scopes to app roles | Yes — returns real post `full_picture` / video source | Sharp post image / playable video in the preview modal |
| Regular production user (no app role), before FB App Review | No — FB silently drops unreviewed scopes | No — returns `{image_url: null, error: "..."}` | Falls back to the 600px hires creative thumbnail, then to text-only fallback with "view original post" CTA |
| Regular production user, after FB App Review | Yes | Yes | Sharp post media |

This means the scope is **safe to request even without review** — FB's behavior is to drop unknown/unreviewed scopes silently during login, not to fail. The app's existing fallback chain keeps working.

## Ad Accounts

- Jason has 80+ ad accounts across multiple Business Managers
- All loaded via paginated `/me/adaccounts` endpoint
- Settings page: check accounts to show in dashboard left panel
- Dashboard left panel: click account to toggle into active view
- Two separate localStorage keys:
  - `fb_selected_accounts` = accounts enabled in settings
  - `fb_active_accounts` = accounts currently selected in dashboard

## Architecture

- **Backend**: FastAPI (Python 3.9+), port 8001
- **Frontend**: React 18 + Vite + TypeScript (`frontend/`), built to `dist/`
- **Auth**: FB JS SDK (browser) → `POST /api/auth/token` → `_runtime_token` in memory
- **Charts**: Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 (tree-shaken imports, not CDN)
- **AI**: Google Gemini API via `/api/ai/chat` endpoint
- **Storage (2026-04-17 PG cutover)**: PostgreSQL via `asyncpg` + `DATABASE_URL`. Three tables auto-created on startup:
  - `campaign_nicknames` — per-campaign store/designer nicknames, shared team-wide
  - `user_settings(fb_user_id, key, value JSONB)` — per-user: `selected_accounts`, `account_order`
  - `shared_settings(key, value JSONB)` — team-wide: `finance_row_markups`, `finance_pinned_ids`, `finance_default_markup`, `finance_show_nicknames`
  localStorage now only holds **ephemeral UI state**: `fb_active_accounts`, date-picker prefs, sidebar collapse, FB token cache. `SettingsProvider` is the hydration gate — fires two GETs in parallel at login, gates the router on success.

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

## 2026-04-14 — 3rd-level thumbnail + preview + compact pass

Batch of UX fixes landed on branch `claude/read-all-files-Aj5R8`:

### `escHtml()` in React JSX is a trap (commit `9a9e81b`)
- Legacy `dashboard.html` wraps FB thumbnail URLs in `escHtml()` and injects via `innerHTML`. The browser re-parses `&amp;` back to `&` so the URL is valid.
- React JSX `src={...}` is an attribute binding — React writes the value verbatim, so `&amp;` stays `&amp;` and every `&` in FB's signed CDN URL gets mangled → signature mismatch → FB 403 → broken thumbnail icons.
- Fix: pass raw `thumbnail_url` directly in React. Inline comment in `CreativeRow.tsx` warns the next person porting from innerHTML.

### 3rd-level ad creative preview modal (commit `1175a0f`)
- Clicking a `CreativeRow` opens a Radix Dialog showing the thumbnail enlarged, plus creative title / body text if FB returned them.
- Toggle cell already stops propagation so ACTIVE/PAUSED toggling does not open the modal.

### Larger thumbnails from FB (commit `b8c3354`)
- FB default `thumbnail_url` is ~64×64 which was too blurry in the 520px modal.
- `main.py:get_ads` now passes `thumbnail_width=600` and `thumbnail_height=600` when requesting the creative field. FB honors these on the AdCreative edge and returns the nearest CDN size (400–600 typically). Backend cache key already includes sorted params so it busts cleanly.

### Compact rows + mobile UX polish (commits `40b758c`, `7a8493d`)
- Finance table rows dropped from 52px to 30px: removed `py-2` from every body `<td>`, shrunk pin button from `h-9 w-9` to `h-[30px] w-[30px]`. Matches the dashboard tree compactness.
- Mobile `table.tree` padding reduced from `10px 8px` to `6px 6px` (header `8px 6px`). Combined with the new `.badge { white-space: nowrap }`, mobile tree rows collapsed from ~70px (badge wrapping "進 行 中" into 3 vertical chars) to ~32px.
- `Modal` component always renders a tappable X close button in the top-right. Title/subtitle get `pr-10` so they never overlap the X. Mobile users can't hit Esc easily and backdrop-tap isn't obvious.
- `MobileAccountPicker` got an autofocused search input at the top so 80+ account lists are usable. Search state resets on every open; "全部帳戶" is suppressed while the user is typing. Rows dropped from `min-h-[48px]` to `min-h-[44px]`, lost the per-row border, and extend edge-to-edge via `-mx-5` so the active highlight is continuous.

### Sidebar toggle icon (commits `918b03b`, `e246f94`)
- `AcctSidebarToggle` in the Topbar uses a hamburger (3-line) icon instead of the two-person Users glyph. Outer border and background were dropped; the icon is now frameless and just changes color between ink/orange to signal collapsed state.

### Dashboard "empty block" fix (commit `6181a15`)
- Tree card lost its `bg-white`. Only the search header carries an explicit `bg-white`. Table rows still paint their own white from globals.css. Result: when the table is shorter than the flex-1 card, the area below 合計 shows the page warm-white color inside the rounded card border instead of a large stark white block.
