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
- **Wrap URLs passed to React JSX `src={...}` in `escHtml()`**. JSX
  attribute bindings write the value literally — they do NOT re-parse
  `&amp;` back to `&` the way `innerHTML` does. escHtml is correct in
  legacy `dashboard.html` (which injects via innerHTML) but will
  literally insert `&amp;` into the attribute and break Facebook's
  signed CDN URLs (signature mismatch → 403 → broken thumbnail). This
  was the root cause of the 3rd-level ad preview regression (commit
  `9a9e81b`). Use the raw URL directly in React; React already escapes
  attribute values correctly.

## React rewrite (as of 2026-04-13)

The frontend is being migrated from the single `dashboard.html` file
to a React + Vite + TypeScript app under `frontend/`. Both coexist
during the transition:

- `main.py` serves the built React bundle at `/` when `dist/` exists,
  falling back to `dashboard.html`
- `/legacy` always serves `dashboard.html` for side-by-side diffing
- `pnpm build` output goes to repo-root `dist/` so FastAPI serves it
  via `StaticFiles(directory="dist")`
- Zeabur deploy config: `zeabur.json` runs
  `corepack enable && cd frontend && pnpm install && pnpm build && cd .. && pip install -r requirements.txt`
- The "no build step" rule is dropped for the React app but the
  legacy `dashboard.html` is still editable without a build

Quality gates (all run in CI, enforced by `pnpm check`):
- `pnpm typecheck` — strict TS + `noUncheckedIndexedAccess`
- `pnpm lint`      — Biome + `lint:no-ad-class` guard
- `pnpm test`      — Vitest (~115 unit tests for pure business logic)
- `pnpm test:e2e`  — Playwright visual regression (Phase 9b)
