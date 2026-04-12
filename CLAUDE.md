# CLAUDE.md — Meta Board Project

## Project Overview

Facebook Ads Dashboard (meta-board) — FastAPI backend + single-page HTML frontend.
Connects to Facebook Marketing API v21.0.

## Tech Stack

- **Backend**: Python / FastAPI / httpx (async)
- **Frontend**: Vanilla JS, single `dashboard.html` (no build step)
- **Design**: Notion-inspired white design system
- **Auth**: Facebook JS SDK (browser) + FastAPI token endpoint (server)

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, all API routes |
| `dashboard.html` | Full SPA frontend |
| `.env` | FB credentials (never commit) |
| `.env.example` | Template for credentials |

## Environment Variables

```
FB_APP_ID       — Facebook App ID
FB_APP_SECRET   — Facebook App Secret
FB_ACCESS_TOKEN — Long-lived user access token (fallback)
FB_API_VERSION  — Graph API version (default: v21.0)
```

## Token Flow

- Server starts with `_ACCESS_TOKEN` from `.env` as fallback
- Browser FB Login sends token to `POST /api/auth/token`
- Server stores in `_runtime_token` (overrides .env token)
- All API calls use `get_token()` which prefers runtime token

## Running Locally

```bash
python main.py          # port 8001
```

## Common Patterns

- All FB API calls go through `fb_get()` or `fb_post()` helpers
- Budget values: multiply by 100 (cents) when sending to FB API
- Account IDs include `act_` prefix (e.g. `act_123456`)
- Pagination: accounts endpoint follows `paging.next` in a while loop

## Do Not

- Commit `.env` (it's in `.gitignore`)
- Add a build step — keep frontend as single HTML file
- Use sync httpx — all FB calls must be async
