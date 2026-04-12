# Project Memory — Meta Board

## FB App

- App ID: `2780372365654462`
- API Version: `v21.0`
- Token type: Long-lived user token (60 days), stored in `.env`

## Ad Accounts

- Jason has 80+ ad accounts
- All loaded via paginated `/me/adaccounts` endpoint
- Selected accounts persisted to `localStorage`

## Design Decisions

- Notion white design system: `#f6f5f4` warm-white, `rgba(0,0,0,0.09)` borders, `#0075de` blue
- Tree table default: collapsed (only campaigns visible)
- Adsets/ads lazy-loaded on first expand
- Multi-account stats: parallel fetch → sum spend/impressions/clicks, average CTR/CPC/CPM

## Server

- Port: `8001`
- Python 3.9 compatible (use `Optional[str]` not `str | None`)

## GitHub

- Repo: https://github.com/jason121380/meta-board
- Branch: `main`
- `.env` excluded from git

## Known Issues / Notes

- Python 3.9 on this machine — avoid union type syntax `X | Y`, use `Optional[X]`
- FB JS SDK App ID is hardcoded in `dashboard.html` (line ~20)
