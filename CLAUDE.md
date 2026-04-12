# CLAUDE.md — LURE Meta Platform

## Project Overview

Facebook Ads management dashboard for LURE agency. FastAPI backend + single-page HTML frontend.
Connects to Facebook Marketing API v21.0 to manage 80+ ad accounts.

## Branding

- Product: **LURE META PLATFORM**
- Colors: Orange `#FF6B2C` (primary), `#FFF5F0` (light bg), `#FFE8D9` (border)
- Font: Noto Sans TC
- Reference design: https://github.com/jason121380/Google-My-Business

## Tech Stack

- **Backend**: Python 3.9 / FastAPI / httpx (async)
- **Frontend**: Vanilla JS, single `dashboard.html` (no build step)
- **Auth**: Facebook JS SDK (browser) + FastAPI token endpoint (server)
- **No database**: all data live from Facebook API

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, all API routes |
| `dashboard.html` | Full SPA frontend (login + dashboard) |
| `.env` | FB credentials (never commit) |
| `.env.example` | Template for credentials |
| `MEMORY.md` | Project context and known issues |

## Environment Variables

```
FB_APP_ID       — Facebook App ID (2780372365654462)
FB_APP_SECRET   — Facebook App Secret
FB_ACCESS_TOKEN — Long-lived user access token (fallback)
FB_API_VERSION  — Graph API version (default: v21.0)
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

## Layout Structure

```
[Nav Sidebar 220px] | [Main Content]
                       [Topbar 60px]
                       [Two-column body]
                         [Account List 240px] | [Stats + Tree Table]
```

Settings page uses same two-column pattern: account list | detail panel.

## Account Selection Logic

- `savedSelectedIds` (localStorage: `fb_selected_accounts`) = accounts enabled in Settings
- `selectedAccounts` (localStorage: `fb_active_accounts`) = accounts active in dashboard
- Dashboard left panel only shows accounts that are in `savedSelectedIds` (if any configured)

## Common Patterns

- All FB API calls: `fb_get()` or `fb_post()` helpers in main.py
- Budget values: × 100 when sending (cents), ÷ 100 when displaying
- Account IDs include `act_` prefix (e.g. `act_123456`)
- Pagination: `get_accounts()` follows `paging.next` in while loop

## Do Not

- Commit `.env`
- Add a build step — keep frontend as single HTML file
- Use sync httpx — all FB calls must be async
- Use `str | None` syntax (Python 3.9 — use `Optional[str]` from typing)
- Add emojis to the UI
