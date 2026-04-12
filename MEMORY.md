# Project Memory — LURE Meta Platform

## Branding

- Product name: **LURE META PLATFORM**
- GitHub repo: https://github.com/jason121380/meta-board
- Design: Orange (#FF6B2C) system, matches Google-My-Business repo style
- Font: Noto Sans TC

## FB App

- App ID: `2780372365654462`
- API Version: `v21.0`
- Token type: Long-lived user token (60 days), stored in `.env`
- Required scopes: `ads_read`, `ads_management`, `business_management`
- Note: `business` field on ad accounts requires `business_management` scope in the token. The `.env` token may lack this — user needs to re-login via FB Login to get updated token with that scope.

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
- **No database**: all data live from FB API

## Layout

- Left sidebar: nav (220px)
- Dashboard view: two-column (account list 240px | stats + tree)
- Settings view: two-column master-detail (account list | detail panel)
- Topbar: 60px fixed, date picker + user avatar dropdown

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
- FB JS SDK App ID hardcoded in `dashboard.html` (`appId: '2780372365654462'`)
- Python 3.9 on this machine — avoid `X | Y` type syntax
