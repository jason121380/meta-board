from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Any, Optional, List
import httpx
import asyncpg
import json
import os
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel

load_dotenv()

APP_ID = os.getenv("FB_APP_ID")
APP_SECRET = os.getenv("FB_APP_SECRET")
_ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
API_VERSION = os.getenv("FB_API_VERSION", "v21.0")
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Runtime token override (from FB Login)
_runtime_token: Optional[str] = None
# Shared httpx client (created in lifespan)
_http_client: Optional[httpx.AsyncClient] = None
# PostgreSQL connection pool
_db_pool: Optional[asyncpg.Pool] = None


def get_token() -> str:
    return _runtime_token or _ACCESS_TOKEN or ""


DASHBOARD_HTML = Path(__file__).parent / "dashboard.html"
STATIC_DIR = Path(__file__).parent / "static"
# Built React app output (from frontend/ via `pnpm build`).
# When this directory exists, FastAPI serves it instead of dashboard.html.
DIST_DIR = Path(__file__).parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_client, _db_pool
    _http_client = httpx.AsyncClient(timeout=30)
    # Connect to PostgreSQL if configured
    if DATABASE_URL:
        try:
            _db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
            async with _db_pool.acquire() as conn:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_settings (
                        user_id TEXT PRIMARY KEY,
                        settings JSONB NOT NULL DEFAULT '{}',
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                """)
        except Exception as e:
            print(f"[DB] Connection failed: {e}")
            _db_pool = None
    yield
    if _db_pool:
        await _db_pool.close()
        _db_pool = None
    await _http_client.aclose()
    _http_client = None


app = FastAPI(title="FB Ads Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve legacy static files (PWA manifest, service worker, icons) — used
# only when the React build dist/ is not present (transitional fallback).
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Serve built React assets (JS / CSS chunks emitted by Vite). Vite's build
# places hashed files under dist/assets/. Mounted before any catch-all so
# they resolve before the SPA fallback route.
_REACT_BUILD_PRESENT = (DIST_DIR / "index.html").exists()
_REACT_ASSETS_PRESENT = (DIST_DIR / "assets").exists()

if _REACT_ASSETS_PRESENT:
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

# Loud startup banner so Zeabur logs show at-a-glance whether the
# React build was found. If you see "[startup] React build: MISSING"
# in the logs, the user will be served dashboard.html (legacy) at "/"
# until you fix the build step.
print(
    f"[startup] React build: {'OK' if _REACT_BUILD_PRESENT else 'MISSING'} "
    f"(dist/index.html), assets mount: {'OK' if _REACT_ASSETS_PRESENT else 'MISSING'}",
    flush=True,
)


# ── Helpers ─────────────────────────────────────────────────────────

# In-memory response cache for FB Graph API GETs. The same user
# typically hits the same (account_id, date_preset) combination across
# multiple views (Dashboard → Analytics → Finance → Alerts), and FB API
# calls take 1-3s each. A 60-second TTL turns those repeat hits into
# instant local lookups while keeping data fresh enough to feel live.
#
# Cache scope is per-token: the key includes a hash of the access token
# so different users (or token rotations) never see each other's data.
import hashlib
import time

_CACHE_TTL_SECONDS = 60.0
_fb_cache: dict[str, tuple[float, Any]] = {}


def _cache_key(token: str, path: str, params: dict, *, kind: str = "single") -> str:
    """Build a stable cache key from token + path + sorted params.
    The token is hashed so it never appears in memory inspection or
    log output in plaintext form. ``kind`` distinguishes single-page
    GETs ("single") from paginated calls ("paged") so they never collide.
    """
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12] if token else "anon"
    # Strip access_token from params before hashing — it's already
    # represented by token_hash.
    sanitized = {k: v for k, v in params.items() if k != "access_token"}
    param_str = "&".join(f"{k}={v}" for k, v in sorted(sanitized.items()))
    return f"{token_hash}::{kind}::{path}::{param_str}"


def _cache_get(key: str) -> Any:
    entry = _fb_cache.get(key)
    if entry is None:
        return None
    inserted_at, data = entry
    if (time.monotonic() - inserted_at) > _CACHE_TTL_SECONDS:
        _fb_cache.pop(key, None)
        return None
    return data


def _cache_put(key: str, data: Any) -> None:
    # Best-effort eviction: cap cache at 500 entries to avoid runaway
    # memory growth across long-running sessions.
    if len(_fb_cache) > 500:
        # Drop the oldest 100 entries to make room
        oldest = sorted(_fb_cache.items(), key=lambda kv: kv[1][0])[:100]
        for k, _ in oldest:
            _fb_cache.pop(k, None)
    _fb_cache[key] = (time.monotonic(), data)


def _cache_clear() -> None:
    """Wipe the entire in-memory cache. Used as the safety-net
    invalidation when a more granular hint isn't available.
    """
    _fb_cache.clear()


def _cache_invalidate(*, account_id: Optional[str] = None, entity_id: Optional[str] = None) -> int:
    """Drop cache entries that could be affected by a mutation.

    The cache key format is ``token::kind::path::params`` (see
    :func:`_cache_key`). We do a substring scan because the path
    encodes the FB Graph node id (``act_X/campaigns``,
    ``camp_id/adsets``, etc.).

    Hints are merged with OR semantics:
      - ``account_id="act_X"`` clears every entry whose path
        references account X (campaigns, adsets, ads, insights).
      - ``entity_id="123"`` clears every entry whose path is
        exactly ``123``, plus any list whose parent is 123 (e.g.
        ``123/adsets``).

    Returns the number of entries dropped (useful for diagnostics).
    Falls back to a full clear if neither hint is provided.
    """
    if account_id is None and entity_id is None:
        before = len(_fb_cache)
        _fb_cache.clear()
        return before

    needles: list[str] = []
    if account_id:
        # The account id can appear with or without `act_` prefix in
        # the path. Match both to be safe.
        needles.append(account_id)
        if account_id.startswith("act_"):
            needles.append(account_id[4:])
        else:
            needles.append(f"act_{account_id}")
    if entity_id:
        needles.append(entity_id)

    to_drop = [k for k in _fb_cache if any(n in k for n in needles)]
    for k in to_drop:
        _fb_cache.pop(k, None)
    return len(to_drop)


async def _fb_request(method: str, path: str, params: Optional[dict] = None, data_payload: Optional[dict] = None) -> dict:
    """Send a request to FB Graph API and convert ALL failure modes to HTTPException
    with a JSON body so the frontend can always parse and display the error.

    GET responses are cached in-memory for 60 seconds (per token + path +
    params) so repeat calls within the TTL window return instantly. POSTs
    are never cached (they are mutations).
    """
    if params is None:
        params = {}
    if data_payload is None:
        data_payload = {}
    token = get_token()
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token not set. Please log in.")

    # Cache lookup for GET only (POSTs are mutations, never cached)
    cache_key: Optional[str] = None
    if method == "GET":
        cache_key = _cache_key(token, path, params, kind="single")
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    url = f"{BASE_URL}/{path}"
    try:
        if method == "GET":
            params = {"access_token": token, **params}
            r = await _http_client.get(url, params=params)
        else:
            data_payload = {"access_token": token, **data_payload}
            r = await _http_client.post(url, data=data_payload)
    except httpx.TimeoutException as e:
        raise HTTPException(status_code=504, detail=f"Facebook API timeout: {e}")
    except httpx.RequestError as e:
        # Includes ConnectError, ProxyError, NetworkError, etc.
        raise HTTPException(status_code=502, detail=f"Cannot reach Facebook API: {type(e).__name__}: {e}")
    # Try to parse JSON response
    try:
        body = r.json()
    except Exception:
        # FB returned non-JSON (rare, usually HTML error page)
        snippet = (r.text or "")[:300]
        raise HTTPException(status_code=502, detail=f"Facebook API returned non-JSON (HTTP {r.status_code}): {snippet}")
    if isinstance(body, dict) and "error" in body:
        err = body["error"] if isinstance(body["error"], dict) else {}
        msg = err.get("message", "Facebook API error")
        # Re-surface FB error code so frontend can react (e.g. token expired = 190)
        code = err.get("code")
        sub = err.get("error_subcode")
        detail = f"{msg} [code={code}{f' subcode={sub}' if sub else ''}]" if code else msg
        raise HTTPException(status_code=400, detail=detail)
    # Cache successful GET responses
    if cache_key is not None:
        _cache_put(cache_key, body)
    return body


async def fb_get(path: str, params: Optional[dict] = None) -> dict:
    return await _fb_request("GET", path, params=params)


async def fb_post(
    path: str,
    payload: Optional[dict] = None,
    *,
    invalidate_account: Optional[str] = None,
    invalidate_entity: Optional[str] = None,
) -> dict:
    """POST a Graph API mutation and selectively bust the read cache.

    If ``invalidate_account`` or ``invalidate_entity`` is provided we
    drop only entries that could be stale. Otherwise we wipe the
    entire cache (safe but coarse). Status / budget toggles know
    exactly which account they affect, so they pass the account id
    and we keep cache hits for unrelated accounts.
    """
    result = await _fb_request("POST", path, data_payload=payload)
    if invalidate_account or invalidate_entity:
        _cache_invalidate(account_id=invalidate_account, entity_id=invalidate_entity)
    else:
        _cache_clear()
    return result


async def fb_get_paginated(path: str, params: Optional[dict] = None) -> List[dict]:
    """Paginate through a FB Graph API endpoint that returns {data:[], paging:{next}}.
    Always raises HTTPException on failure (never lets httpx errors bubble up as 500).

    Final result lists are cached in-memory for 60 seconds (per token + path
    + initial params). Subsequent calls within the TTL window return without
    hitting Facebook at all — a major speedup for the heavy
    /api/accounts and /api/accounts/{id}/campaigns endpoints.
    """
    if params is None:
        params = {}
    token = get_token()
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token not set. Please log in.")

    cache_key = _cache_key(token, path, params, kind="paged")
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # already a List[dict]

    items: List[dict] = []
    next_url: Optional[str] = f"{BASE_URL}/{path}"
    page_params = {"access_token": token, **params}
    while next_url:
        try:
            r = await _http_client.get(next_url, params=page_params)
        except httpx.TimeoutException as e:
            raise HTTPException(status_code=504, detail=f"Facebook API timeout: {e}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Cannot reach Facebook API: {type(e).__name__}: {e}")
        try:
            data = r.json()
        except Exception:
            snippet = (r.text or "")[:300]
            raise HTTPException(status_code=502, detail=f"Facebook API returned non-JSON (HTTP {r.status_code}): {snippet}")
        if isinstance(data, dict) and "error" in data:
            err = data["error"] if isinstance(data["error"], dict) else {}
            msg = err.get("message", "Facebook API error")
            code = err.get("code")
            detail = f"{msg} [code={code}]" if code else msg
            raise HTTPException(status_code=400, detail=detail)
        items.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        page_params = {}  # next_url already contains all params
    _cache_put(cache_key, items)
    return items


def _insights_clause(fields: str, date_preset: str = "last_30d", time_range: Optional[str] = None) -> str:
    """Build FB insights sub-field with correct date parameter."""
    if time_range:
        return f"insights.time_range({time_range}){{{fields}}}"
    return f"insights.date_preset({date_preset}){{{fields}}}"


# ── Pages ───────────────────────────────────────────────────────────

def _react_index() -> Optional[str]:
    """Return the built React app's index.html if available, else None."""
    idx = DIST_DIR / "index.html"
    if idx.exists():
        return idx.read_text(encoding="utf-8")
    return None


def _legacy_index() -> str:
    """Return the hand-written dashboard.html as the fallback index."""
    return DASHBOARD_HTML.read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
async def root():
    react = _react_index()
    return react if react is not None else _legacy_index()


@app.get("/api/_status")
async def app_status():
    """Diagnostic endpoint: which build is the server actually serving?

    Useful when something at "/" looks wrong and you can't tell
    whether you're hitting React or the legacy dashboard.html. Hit
    this URL directly and the response tells you exactly what the
    server can see on disk.
    """
    return {
        "serving": "react" if _REACT_BUILD_PRESENT else "legacy",
        "react_index_present": _REACT_BUILD_PRESENT,
        "react_assets_present": _REACT_ASSETS_PRESENT,
        "dist_dir": str(DIST_DIR),
        "legacy_url": "/legacy",
    }


@app.get("/legacy", response_class=HTMLResponse)
async def legacy_dashboard():
    """Always serve the old dashboard.html, even if the React build exists.
    Kept until Phase 10 cutover for side-by-side visual regression testing.
    """
    return _legacy_index()


@app.get("/sw.js")
async def service_worker():
    """Serve service worker from root scope.

    Vite PWA emits sw.js into dist/ at build time; prefer that. Fall back
    to the hand-written static/sw.js if no React build is present.
    """
    for candidate in (DIST_DIR / "sw.js", STATIC_DIR / "sw.js"):
        if candidate.exists():
            return HTMLResponse(
                content=candidate.read_text(encoding="utf-8"),
                media_type="application/javascript",
            )
    return HTMLResponse(content="// no service worker", media_type="application/javascript")


@app.get("/manifest.json")
async def manifest():
    """Serve PWA manifest from root.

    Vite PWA writes manifest.webmanifest into dist/; fall back to
    static/manifest.json during transition.
    """
    for candidate in (
        DIST_DIR / "manifest.webmanifest",
        DIST_DIR / "manifest.json",
        STATIC_DIR / "manifest.json",
    ):
        if candidate.exists():
            return HTMLResponse(
                content=candidate.read_text(encoding="utf-8"),
                media_type="application/manifest+json",
            )
    return JSONResponse(content={})


@app.get("/manifest.webmanifest")
async def manifest_webmanifest():
    return await manifest()


# ── Auth ─────────────────────────────────────────────────────────────

class TokenPayload(BaseModel):
    token: str

@app.post("/api/auth/token")
async def set_token(payload: TokenPayload):
    global _runtime_token
    _runtime_token = payload.token
    try:
        me = await fb_get("me", {"fields": "id,name,picture"})
        return {"ok": True, "name": me.get("name"), "id": me.get("id")}
    except Exception as e:
        _runtime_token = None
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/auth/token")
async def clear_token():
    global _runtime_token
    _runtime_token = None
    return {"ok": True}

@app.get("/api/auth/me")
async def get_me():
    try:
        me = await fb_get("me", {"fields": "id,name,picture.width(80)"})
        return {"logged_in": True, **me}
    except Exception:
        return {"logged_in": False}


# ── Quick Launch ──────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    account_id: str
    name: str
    objective: str = "OUTCOME_TRAFFIC"
    daily_budget: int = 500  # TWD
    status: str = "PAUSED"

@app.post("/api/quick-launch/campaign")
async def quick_launch_campaign(payload: CampaignCreate):
    return await fb_post(
        f"{payload.account_id}/campaigns",
        {
            "name": payload.name,
            "objective": payload.objective,
            "status": payload.status,
            "special_ad_categories": "[]",
            "daily_budget": str(payload.daily_budget),
        },
        invalidate_account=payload.account_id,
    )


# ── 廣告帳戶 ─────────────────────────────────────────────────────────

@app.get("/api/accounts")
async def get_accounts():
    accounts = await fb_get_paginated("me/adaccounts", {
        "fields": "id,name,account_status,currency,timezone_name,business",
        "limit": "100",
    })
    return {"data": accounts}


# ── 行銷活動 ─────────────────────────────────────────────────────────

@app.get("/api/accounts/{account_id}/campaigns")
async def get_campaigns(account_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None, include_archived: bool = False):
    """List campaigns for an account, with progressive fallback so a
    single FB-side restriction (e.g. effective_status not allowed on
    a particular ad account) doesn't make the whole call return 400.

    Attempts, in order — each tier strips one source of FB rejection:
      1. fields + insights + effective_status (full data, all states)
      2. fields + insights                   (drops archived filter)
      3. fields only                          (drops insights too)
      4. minimal id/name/status               (last-resort smoke test)

    Returns the FIRST attempt that succeeds. If every attempt fails
    we re-raise the last error so the frontend gets the actual FB
    message instead of a silent empty list.
    """
    ins = _insights_clause(
        "spend,impressions,clicks,ctr,cpc,cpm,frequency,reach,actions",
        date_preset,
        time_range,
    )
    full_fields = f"id,name,status,objective,daily_budget,lifetime_budget,{ins}"
    no_ins_fields = "id,name,status,objective,daily_budget,lifetime_budget"
    archived_filter = {"effective_status": '["ACTIVE","PAUSED","ARCHIVED","DELETED"]'}

    attempts: list[tuple[str, dict]] = []
    if include_archived:
        attempts.append(("insights+archived", {"fields": full_fields, "limit": "100", **archived_filter}))
    attempts.append(("insights", {"fields": full_fields, "limit": "100"}))
    if include_archived:
        attempts.append(("no-insights+archived", {"fields": no_ins_fields, "limit": "100", **archived_filter}))
    attempts.append(("no-insights", {"fields": no_ins_fields, "limit": "100"}))
    attempts.append(("minimal", {"fields": "id,name,status", "limit": "100"}))

    last_error: Optional[HTTPException] = None
    for tier, params in attempts:
        try:
            camps = await fb_get_paginated(f"{account_id}/campaigns", params)
            if last_error is not None:
                # Log the recovery so we can spot consistently bad accounts
                print(
                    f"[campaigns] {account_id} recovered at tier={tier} "
                    f"after earlier failure: {last_error.detail}",
                    flush=True,
                )
            return {"data": camps}
        except HTTPException as e:
            print(
                f"[campaigns] {account_id} tier={tier} failed: "
                f"{e.status_code} {e.detail}",
                flush=True,
            )
            last_error = e
            continue

    # All attempts failed — re-raise the last so the frontend sees
    # the real FB message, not a generic 400.
    if last_error is not None:
        raise last_error
    raise HTTPException(status_code=502, detail="Failed to load campaigns from Facebook API")


@app.post("/api/campaigns/{campaign_id}/status")
async def update_campaign_status(campaign_id: str, status: str = Query(...)):
    return await fb_post(campaign_id, {"status": status}, invalidate_entity=campaign_id)


@app.post("/api/campaigns/{campaign_id}/budget")
async def update_campaign_budget(campaign_id: str, daily_budget: int = Query(None), lifetime_budget: int = Query(None)):
    payload = {}
    if daily_budget:
        payload["daily_budget"] = str(daily_budget)
    if lifetime_budget:
        payload["lifetime_budget"] = str(lifetime_budget)
    return await fb_post(campaign_id, payload, invalidate_entity=campaign_id)


# ── 廣告組合 ─────────────────────────────────────────────────────────

@app.get("/api/campaigns/{campaign_id}/adsets")
async def get_adsets(campaign_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None):
    ins = _insights_clause("spend,impressions,clicks,ctr,cpc,cpm,frequency,actions", date_preset, time_range)
    try:
        data = await fb_get(f"{campaign_id}/adsets", {
            "fields": f"id,name,status,daily_budget,lifetime_budget,{ins}",
            "limit": "100"
        })
    except Exception:
        # Fallback without insights if date query fails
        data = await fb_get(f"{campaign_id}/adsets", {
            "fields": "id,name,status,daily_budget,lifetime_budget",
            "limit": "100"
        })
    return data


@app.post("/api/adsets/{adset_id}/status")
async def update_adset_status(adset_id: str, status: str = Query(...)):
    return await fb_post(adset_id, {"status": status}, invalidate_entity=adset_id)


@app.post("/api/adsets/{adset_id}/budget")
async def update_adset_budget(adset_id: str, daily_budget: int = Query(None)):
    payload = {}
    if daily_budget:
        payload["daily_budget"] = str(daily_budget)
    return await fb_post(adset_id, payload, invalidate_entity=adset_id)


# ── 廣告 ─────────────────────────────────────────────────────────────

@app.get("/api/adsets/{adset_id}/ads")
async def get_ads(adset_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None):
    ins = _insights_clause("spend,impressions,clicks,ctr,cpc,cpm,actions", date_preset, time_range)
    last_error: Optional[HTTPException] = None
    # Progressive fallback so a partial failure (e.g. account lacks
    # creative permission) still returns something usable.
    #
    # We request BOTH ``thumbnail_url`` (small, for the 30x30 row
    # icon) and ``image_url`` (full-resolution source asset, used by
    # the preview modal). FB's default ``thumbnail_url`` is ~64x64,
    # which looks blurry when scaled up to the 520px modal; the
    # ``thumbnail_width``/``thumbnail_height`` query params only
    # apply when you hit /{creative_id} directly and are ignored
    # when the thumbnail is requested through field expansion on
    # the Ad edge. ``image_url`` returns the original CDN asset
    # (typically 1080px+) for image-based creatives, which is sharp
    # at any reasonable preview scale. For video / carousel /
    # dynamic creatives ``image_url`` may be absent — the frontend
    # falls back to ``thumbnail_url`` in that case.
    attempts = [
        # Tier 1: everything — image_url for sharp still preview,
        # object_story_spec.video_data.video_id so the frontend can
        # lazy-fetch the playable video source when the modal opens.
        f"id,name,status,creative{{thumbnail_url,image_url,object_story_spec{{video_data}},title,body}},{ins}",
        # Tier 2: drop object_story_spec (some accounts reject it).
        f"id,name,status,creative{{thumbnail_url,image_url,title,body}},{ins}",
        # Tier 3: drop image_url.
        f"id,name,status,creative{{thumbnail_url,title,body}},{ins}",
        f"id,name,status,{ins}",
        "id,name,status",
    ]
    for fields in attempts:
        try:
            params = {"fields": fields, "limit": "100"}
            if "thumbnail_url" in fields:
                params["thumbnail_width"] = "600"
                params["thumbnail_height"] = "600"
            return await fb_get(f"{adset_id}/ads", params)
        except HTTPException as e:
            last_error = e
            continue
    # All attempts failed — surface the most recent error so the frontend can
    # display the actual reason instead of a silent 500.
    if last_error is not None:
        raise last_error
    raise HTTPException(status_code=502, detail="Failed to load ads from Facebook API")


@app.get("/api/videos/{video_id}/source")
async def get_video_source(video_id: str):
    """Fetch the playable source URL + poster for a FB video asset.

    Used by the 3rd-level creative preview modal so video ads play
    inline instead of showing a tiny thumbnail. The Graph API
    ``/{video_id}`` edge returns a signed ``source`` URL that the
    browser can use directly in a ``<video>`` element, plus a
    ``picture`` poster frame.

    This call is intentionally LAZY from the frontend (the React
    Query hook enables only when the preview modal opens) so we
    don't pay per-row latency to fetch a URL most users never view.
    """
    data = await fb_get(video_id, {"fields": "source,picture"})
    return {
        "source": data.get("source"),
        "picture": data.get("picture"),
    }


@app.post("/api/ads/{ad_id}/status")
async def update_ad_status(ad_id: str, status: str = Query(...)):
    return await fb_post(ad_id, {"status": status}, invalidate_entity=ad_id)


# ── 帳戶整體成效 ──────────────────────────────────────────────────────

@app.get("/api/accounts/{account_id}/insights")
async def get_account_insights(account_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None):
    params = {
        "fields": "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions",
    }
    if time_range:
        params["time_range"] = time_range
    else:
        params["date_preset"] = date_preset
    data = await fb_get(f"{account_id}/insights", params)
    return data


# ── 用戶設定（PostgreSQL 雲端同步）─────────────────────────────

class UserSettings(BaseModel):
    selected_accounts: List[str] = []
    active_accounts: List[str] = []
    acct_order: List[str] = []
    filter_active_only: bool = True
    fin_row_markups: dict = {}
    fin_markup_default: float = 5

@app.get("/api/settings/{user_id}")
async def get_settings(user_id: str):
    if not _db_pool:
        return {"settings": None}
    async with _db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT settings FROM user_settings WHERE user_id = $1", user_id
        )
    if row:
        return {"settings": json.loads(row["settings"]) if isinstance(row["settings"], str) else row["settings"]}
    return {"settings": None}

@app.post("/api/settings/{user_id}")
async def save_settings(user_id: str, payload: UserSettings):
    if not _db_pool:
        raise HTTPException(status_code=503, detail="Database not configured")
    data = json.dumps(payload.dict())
    async with _db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET settings = $2::jsonb, updated_at = NOW()
        """, user_id, data)
    return {"ok": True}


# ── AI Chat (Gemini) ──────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "model"
    text: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None  # ad data summary from frontend

@app.post("/api/ai/chat")
async def ai_chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    system_prompt = """你是 LURE 廣告代理商的 AI 廣告顧問，專門分析 Facebook / Meta 廣告成效。
使用繁體中文回答。回答要簡潔、有洞察力、直接提供可執行的建議。
專業術語：CTR（點擊率）、CPC（每次點擊成本）、CPM（每千次曝光成本）、ROAS（廣告投資報酬率）、私訊轉換。"""

    if req.context:
        system_prompt += f"\n\n目前廣告數據摘要：\n{req.context}"

    contents = []
    for m in req.messages:
        contents.append({
            "role": m.role,
            "parts": [{"text": m.text}]
        })

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1024,
        }
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    r = await _http_client.post(url, json=payload)
    data = r.json()

    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "Gemini error"))

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return {"reply": text}


# ── SPA catch-all (MUST be registered last) ─────────────────────────
# React Router uses client-side paths like /dashboard, /analytics, /finance.
# A browser hard-refresh on those paths hits FastAPI, which otherwise 404s.
# This catch-all returns the React index.html for any unmatched GET that
# does not look like an API or asset request.
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "static/", "assets/")):
        raise HTTPException(status_code=404, detail="Not found")
    react = _react_index()
    return react if react is not None else _legacy_index()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
