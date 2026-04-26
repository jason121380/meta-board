# CLAUDE.md — LURE Meta Platform

## Project Overview

Facebook Ads management dashboard for LURE agency. FastAPI backend + React SPA.
Connects to Facebook Marketing API v21.0 to manage 80+ ad accounts across multiple Business Managers.

## Branding

- Product: **LURE META PLATFORM**
- Colors: Orange `#FF6B2C` (primary), `#FFF5F0` (light bg / warm-white), `#FFE8D9` (border)
- Font: Noto Sans TC
- Reference design: https://github.com/jason121380/Google-My-Business

## Tech Stack

- **Backend**: Python 3.9+ / FastAPI / httpx (async)
- **Frontend**: React 18 + Vite + TypeScript (`frontend/`)
- **Charts**: Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0
- **Auth**: Facebook JS SDK (browser) + FastAPI token endpoint (server)
- **AI**: Google Gemini API (optional, for AI recommendations)
- **Storage (as of 2026-04-17)**:
  - **PostgreSQL** (via `asyncpg`, `DATABASE_URL` env) — source of truth for:
    - `campaign_nicknames` (campaign_id → store, designer) — shared team-wide
    - `user_settings` (fb_user_id, key, value JSONB) — per-user: `selected_accounts`, `account_order`
    - `shared_settings` (key, value JSONB) — team-wide: `finance_row_markups`, `finance_pinned_ids`, `finance_default_markup`, `finance_show_nicknames`. **Underscore-prefixed keys (`_fb_runtime_token`) are server-internal** and are filtered out by `GET /api/settings/shared` — never expose to the frontend.
    - `line_groups` (group_id PK, **group_name** (real LINE display name from /v2/bot/group/{id}/summary), label (user nickname), joined_at, left_at) — auto-upserted by the `/api/line/webhook` route on LINE `join`/`leave` events. Lifespan startup also runs a one-shot backfill for legacy rows whose `group_name` is empty.
    - `campaign_line_push_configs` (campaign ↔ group pairings: frequency, weekdays/month_day, hour/minute, date_range, enabled, next_run_at, fail_count) — partial index on `(next_run_at) WHERE enabled` for the scheduler tick
    - `line_push_logs` (per-push audit rows, success/error/preview)
  - **Browser localStorage** — ephemeral UI state only:
    - `fb_active_accounts` (dashboard current selection — intentionally NOT synced)
    - `filter_active_only`, date-picker preferences, sidebar collapse state
    - `meta_dash_fb_token` (FB login token cache)

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, all API routes |
| `frontend/` | React + Vite + TypeScript SPA source |
| `frontend/src/main.tsx` | React entry + QueryClient provider |
| `frontend/src/App.tsx` | Auth gate + host-level modals |
| `frontend/src/router.tsx` | Router + lazy-loaded views |
| `frontend/public/` | Favicon + PWA icons (copied to `dist/` root at build) |
| `dist/` | `pnpm build` output — served by FastAPI in prod |
| `.env` | FB + Gemini credentials (never commit) |
| `.env.example` | Template for credentials |
| `MEMORY.md` | Project context, known issues, architecture decisions |

## Environment Variables

```
LINE_CHANNEL_ACCESS_TOKEN — LINE Messaging API channel access token (required for push)
LINE_CHANNEL_SECRET       — LINE channel secret (verifies X-Line-Signature on /api/line/webhook)
LINE_MOCK                 — Set to "1" to print push payloads instead of calling LINE (dev)
SCHEDULER_TZ              — IANA zone for HH:MM in push configs (default Asia/Taipei)
FB_APP_ID       — Facebook App ID (2780372365654462)
FB_APP_SECRET   — Facebook App Secret
FB_ACCESS_TOKEN — Long-lived user access token (fallback, overridden by FB Login)
FB_API_VERSION  — Graph API version (default: v21.0)
GEMINI_API_KEY  — Google Gemini API key (for AI recommendations)
GEMINI_MODEL    — Gemini model (default: gemini-3-flash-preview)
```

## Token Flow

1. User visits `/` → sees login page
2. Clicks FB Login → FB OAuth popup → gets token
3. Browser POSTs token to `/api/auth/token`
4. Server stores in `_runtime_token` AND **persists to PG** as `_fb_runtime_token` in `shared_settings`
5. All API calls use `get_token()` which prefers runtime token (fallback to .env `FB_ACCESS_TOKEN`)
6. Lifespan startup restores `_runtime_token` from PG → server restarts (e.g. Zeabur redeploy) don't break the public share page until the token actually expires (~60 days for long-lived)

For the public **/r/:campaignId** share page: viewers do NOT log in. The frontend `request()` helper detects `window.location.pathname.startsWith("/r/")` and skips `refreshBackendToken()` (the FB SDK isn't loaded there anyway), translating any 401 to a friendly "報告暫時無法載入,請聯繫管理員" instead of FB's raw "Please log in".

Required FB scopes: `ads_read`, `ads_management`, `business_management`, `pages_read_engagement`

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
Sidebar 工具區拆成兩個入口（2026-04-26 後）:
- **廣告帳號設定** `/settings` — BM panel + 帳戶啟用 / 多選 / 拖曳排序
- **LINE 推播設定** `/line-push` — `LineGroupsContent` 表格列出每個 LINE 群組,含「重新抓取群組名稱」+ 自訂暱稱 + 該群組目前綁定的所有 push configs（一個 group 多 campaign）。每筆 config 有編輯/刪除按鈕,新增推播時用可搜尋的 `GroupPushConfigModal` 選帳戶 / 行銷活動。

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

### Tree / Finance row compactness (React)
- Body `<td>`s in `table.tree` and `FinanceTable` have NO vertical padding — row height is driven by the tallest child control (typically `Button size="sm"` = 30px or pin button `h-[30px] w-[30px]`). Result: both tables have ~30px row height on desktop.
- On mobile, `globals.css` overrides `table.tree th/td` padding to `6px 6px` (header `8px 6px` for sort-arrow headroom). Combined with the nowrap badge, mobile tree rows are ~32px instead of the ~70px they used to be.
- `.badge` has `white-space: nowrap` so "進行中" never wraps into three stacked CJK characters in narrow mobile cells.

### Modal (Radix Dialog)
- The `<Modal/>` component always renders a tappable X close button in the top-right corner. Title and subtitle get `pr-10` so they do not overlap the X. Mobile users can't hit Esc, and the backdrop-tap affordance isn't always discoverable.
- `MobileAccountPicker` opens a search-enabled Modal: autofocused `<input type="search">` filters accounts by substring match on name. Search state resets every open. "全部帳戶" is suppressed while the user is typing.

### Ad creative preview (3rd level)
- Clicking a `CreativeRow` opens a preview Modal showing the FB thumbnail enlarged, plus the creative title / body text.
- Backend `get_ads` passes `thumbnail_width=600` and `thumbnail_height=600` when requesting the creative field so the thumbnail is sharp at modal scale. FB returns the nearest CDN size.
- The dashboard tree card has a transparent bg (only the search header has `bg-white` explicitly). When the table is shorter than the card, the area below 合計 shows the page warm-white instead of a stark white block.

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

## Insight Report (LINE flex push + share page `/r/:id`)

The same recommendation logic runs in two places — keep them in sync:
- Backend `_evaluate_alert_recommendations` in `main.py` → embedded in the LINE flex push body.
- Frontend `lib/recommendations.ts` `buildCampaignRecommendations` → bullet list above the share-page report.

**Rule order** (priority from top):

| 條件 | 結果 |
|------|------|
| msgs > 0 且 msgCost < $100 | 「非常好,持續以私訊轉換為主軸」(忽略 CPC) |
| msgs > 0 且 100 ≤ msgCost ≤ 200 | 「平均值,維持現狀即可」 |
| msgs > 0 且 200 < msgCost ≤ 300 | 「偏高,待觀察」 |
| msgs > 0 且 msgCost > 300 + CPC ≤ 4 | 「太高、但 CPC 表現不錯,檢視私訊回覆流程」 (此情境下 **略過頻次警示**) |
| msgs > 0 且 msgCost > 300 + CPC > 4 | 「太高、CPC 也偏高,整體優化」 (此情境下 **略過頻次警示**) |
| msgs == 0 且 CPC > 6 | 「太高,需要調整」 |
| msgs == 0 且 5 < CPC ≤ 6 | 「可以優化」 |
| msgs == 0 且 4 < CPC ≤ 5 | 「偏高,待觀察」 |
| frequency > 5 + spend > $1,000 | 「過高,擴大受眾」 |
| frequency > 4 + spend > $500 | 「偏高,留意素材疲勞」 |

### Share page (`/r/:campaignId`) layout

`ReportContent` (shared by `<ReportModal/>` and `<ShareReportPage/>`) is **insight-oriented**, fully auto-expanded:
1. Header (status / objective / date label)
2. 12-cell KPI grid — 花費 / 私訊數 / 私訊成本 cards have an orange highlight border so the operator's eye lands on outcomes first.
3. **優化建議** narrative bullet list (from `buildCampaignRecommendations`).
4. Per-adset card (`AdsetCard`):
   - Mini KPI row
   - `<BreakdownInsightStrip/>` — 4 cards (版位 / 性別 / 年齡 / 地區), each fires its own React Query in parallel and shows the **winner** for that dim. Winner picked by: msgCost (lowest, if any bucket has messages) → CTR (highest, requires impressions ≥100) → impressions (fallback).
   - Ad cards grid (2 cols on ≥sm). Each card has 56px thumbnail (click → `<CreativePreviewModal/>` 600px hi-res), KPI inline, and the best-performing ad in this adset gets a "★ 表現最佳" orange badge.

### Breakdown endpoint

`GET /api/breakdown?level={adset|ad}&id=&dim={age|gender|region|publisher_platform}&date_preset=...&time_range=...` — proxies FB Graph's `<entity>/insights?breakdowns=...` with the dim whitelisted. Returns `{key, spend, impressions, clicks, ctr, cpc, cpm, msgs}` per bucket.

## Do Not

- Commit `.env`
- Use sync httpx — all FB calls must be async
- Use `str | None` syntax (Python 3.9 — use `Optional[str]` from typing)
- Add emojis to the UI
- Define `getMsgCount` locally inside a function — it must remain a global function (legacy) or a module-level named export (React rewrite). NEVER copy its logic inline.
- Use `onsite_conversion.total_messaging_connection` for message counting (double-counts)
- Use `accent-color` on checkboxes — always use `class="custom-cb"`
- **Use any CSS class name starting with `ad-` or `ads-`**. Ad blockers
  (uBlock Origin, AdBlock Plus) include filter list rules like
  `[class^="ad-"]` that set `display:none !important` on matching
  elements. This is the root cause of commit `d720fa2` (3rd-level ads
  invisible). Use `creative-*` or another prefix instead. The
  `frontend/scripts/check-no-ad-class.mjs` pre-commit guard enforces
  this automatically — it runs as part of `pnpm lint`.
- **Wrap URLs passed to React JSX `src={...}` in any `escHtml()`-style
  helper**. JSX attribute bindings write the value literally — they do
  NOT re-parse `&amp;` back to `&`. Any HTML-escaping of a Facebook
  signed CDN URL will literally insert `&amp;` into the attribute and
  break the signature (→ 403 → broken thumbnail). Use the raw URL
  directly in React; React already escapes attribute values correctly.

## React-only architecture (as of 2026-04-15)

The legacy `dashboard.html` single-file SPA was deleted in the
React-only cutover. The React app under `frontend/` is now the ONE
and ONLY frontend:

- `main.py` serves the built React bundle at `/` from module-level
  cached bytes (the SPA catch-all reads from `_REACT_INDEX_HTML`,
  not from disk per request)
- `pnpm build` output goes to repo-root `dist/`
- Top-level PWA assets (`favicon.png`, `icon-192.png`, `icon-512.png`)
  live in `frontend/public/` and are copied to `dist/` at build time;
  `main.py` serves them via dedicated routes
- Zeabur deploy config: `zeabur.json` runs
  `corepack enable && cd frontend && pnpm install && pnpm build && cd .. && pip install -r requirements.txt`
- User settings (selected accounts, markups, pins, nicknames, etc.)
  are persisted to **PostgreSQL** via `DATABASE_URL`. See the Storage
  section above for the split between per-user, shared, and ephemeral
  (localStorage) state. `SettingsProvider` (under `providers/`) is the
  hydration gate — it fires the two GETs in parallel on login and
  only renders the app once both settle.

Quality gates (all run in CI, enforced by `pnpm check`):
- `pnpm typecheck` — strict TS + `noUncheckedIndexedAccess`
- `pnpm lint`      — Biome + `lint:no-ad-class` guard
- `pnpm test`      — Vitest unit tests for pure business logic
- `pnpm test:e2e`  — Playwright visual regression
