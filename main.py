from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from typing import Any, Optional, List
import asyncio
import httpx
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

# Runtime token override (from FB Login)
_runtime_token: Optional[str] = None
# Shared httpx client (created in lifespan)
_http_client: Optional[httpx.AsyncClient] = None


def get_token() -> str:
    return _runtime_token or _ACCESS_TOKEN or ""


# Built React app output (from frontend/ via `pnpm build`). Served as
# the ONE and ONLY frontend — the legacy dashboard.html + the optional
# PostgreSQL user-settings sync were removed in the React-only cutover.
DIST_DIR = Path(__file__).parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_client
    # Per-request overrides in _fb_fetch_and_cache set the real
    # timeout (10s for GET, 30s for POST). This client-level value
    # is just a safety ceiling for any code path that slips through
    # without an explicit override.
    _http_client = httpx.AsyncClient(timeout=30)
    yield
    await _http_client.aclose()
    _http_client = None


app = FastAPI(title="FB Ads Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip EVERY response >500 bytes for clients that send Accept-Encoding:
# gzip. Every FB API JSON response compresses roughly 4-5× so the
# savings on the proxy path are substantial.
# level=6 is the httpx / nginx default — best size/CPU balance.
app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)

# Serve built React assets (JS / CSS chunks emitted by Vite). Vite's build
# places hashed files under dist/assets/. Mounted before any catch-all so
# they resolve before the SPA fallback route.
_REACT_BUILD_PRESENT = (DIST_DIR / "index.html").exists()
_REACT_ASSETS_PRESENT = (DIST_DIR / "assets").exists()

if _REACT_ASSETS_PRESENT:
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


# ── Startup-cached HTML / PWA assets ────────────────────────────────
#
# The SPA catch-all fires on EVERY browser hard-refresh of a React
# route (/dashboard, /analytics, …). Reading index.html from disk per
# request would be a real hotpath. Same for sw.js / manifest.json /
# favicons. Everything is read exactly once at import time into
# module-level bytes — responses are served straight from memory.
# A redeploy restarts the Python process and picks up fresh bytes.
def _read_bytes(path: Path) -> Optional[bytes]:
    try:
        return path.read_bytes() if path.exists() else None
    except OSError:
        return None


_REACT_INDEX_HTML: Optional[bytes] = _read_bytes(DIST_DIR / "index.html")
_SW_JS: Optional[bytes] = _read_bytes(DIST_DIR / "sw.js")
_MANIFEST_JSON: Optional[bytes] = (
    _read_bytes(DIST_DIR / "manifest.webmanifest")
    or _read_bytes(DIST_DIR / "manifest.json")
)

# Top-level PWA assets — Vite copies these from frontend/public/ to
# the root of dist/ at build time. They must be served at `/favicon.png`
# etc. (not under `/assets/`) because frontend/index.html references
# them at the root path.
_FAVICON_PNG: Optional[bytes] = _read_bytes(DIST_DIR / "favicon.png")
_ICON_192_PNG: Optional[bytes] = _read_bytes(DIST_DIR / "icon-192.png")
_ICON_512_PNG: Optional[bytes] = _read_bytes(DIST_DIR / "icon-512.png")

# Loud startup banner so Zeabur logs show at-a-glance whether the
# React build was found. If you see "[startup] React build: MISSING"
# in the logs, the server has no index.html to serve and will
# return a minimal placeholder at "/" until you fix the build step.
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
import re
import time

_CACHE_TTL_SECONDS = 60.0
_fb_cache: dict[str, tuple[float, Any]] = {}
# Per-key request locks — when N concurrent requests miss the same
# cache key, the first one holds the lock and actually fans out to
# FB, while the rest await the lock and hit the now-populated cache
# on their retry. This prevents a cache stampede on /api/accounts and
# /api/overview, which every tab fires on first load.
_fb_cache_locks: dict[str, asyncio.Lock] = {}


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


def _cache_lock(key: str) -> asyncio.Lock:
    """Return the asyncio.Lock guarding ``key``, creating it on first
    miss. Locks are kept in a parallel dict so the cache itself stays
    a plain value map. Locks are cheap (~200 bytes each) and are
    evicted alongside their entries when the LRU prunes.
    """
    lock = _fb_cache_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _fb_cache_locks[key] = lock
    return lock


def _cache_clear() -> None:
    """Wipe the entire in-memory cache. Used as the safety-net
    invalidation when a more granular hint isn't available.
    """
    _fb_cache.clear()
    _fb_cache_locks.clear()


# Cache key format is ``token::kind::path::params`` — we only want to
# match the path segment, not the token hash or param string. Path
# segments are slash-delimited and can contain the entity id in the
# middle. This pattern extracts the path so we can do a proper
# tokenised match instead of a naive substring scan (which matches
# act_123 against act_1234 — the prefix-boundary bug).
_CACHE_KEY_PATH_RE = re.compile(r"^[^:]+::[^:]+::([^:]+)::")


def _key_path(key: str) -> str:
    m = _CACHE_KEY_PATH_RE.match(key)
    return m.group(1) if m else key


def _path_references_id(path: str, fb_id: str) -> bool:
    """Does ``path`` contain ``fb_id`` as a whole segment?

    Cache keys encode the FB Graph path like ``act_123/campaigns``.
    Splitting on '/' and checking equality avoids the classic
    ``"act_123" in "act_1234/campaigns"`` false positive.
    """
    if not fb_id:
        return False
    for segment in path.split("/"):
        if segment == fb_id:
            return True
    return False


def _cache_invalidate(*, account_id: Optional[str] = None, entity_id: Optional[str] = None) -> int:
    """Drop cache entries that could be affected by a mutation.

    Hints are merged with OR semantics:
      - ``account_id="act_X"`` clears every entry whose path
        references account X (campaigns, adsets, ads, insights).
        Normalised so ``act_123`` and ``123`` both match.
      - ``entity_id="123"`` clears every entry whose path contains
        ``123`` as a whole segment (so ``123/adsets`` matches but
        ``1234/adsets`` does NOT — fixes the prefix-boundary bug).

    Returns the number of entries dropped. Falls back to a full
    clear if neither hint is provided.
    """
    if account_id is None and entity_id is None:
        before = len(_fb_cache)
        _cache_clear()
        return before

    # Build a set of ids to check per-segment equality against, with
    # both ``act_X`` and bare-``X`` forms where applicable.
    ids: list[str] = []
    if account_id:
        ids.append(account_id)
        if account_id.startswith("act_"):
            ids.append(account_id[4:])
        else:
            ids.append(f"act_{account_id}")
    if entity_id:
        ids.append(entity_id)

    to_drop: list[str] = []
    for k in _fb_cache:
        path = _key_path(k)
        if any(_path_references_id(path, i) for i in ids):
            to_drop.append(k)
    for k in to_drop:
        _fb_cache.pop(k, None)
        _fb_cache_locks.pop(k, None)
    return len(to_drop)


# Per-method httpx timeouts. GETs drive the dashboard UX and should
# fail fast (10s) so a slow FB account doesn't freeze the page.
# Mutations (POSTs for status / budget / quick-launch) tolerate the
# old 30s budget because FB's write path occasionally lags.
_GET_TIMEOUT = 10.0
_POST_TIMEOUT = 30.0


async def _fb_request(method: str, path: str, params: Optional[dict] = None, data_payload: Optional[dict] = None) -> dict:
    """Send a request to FB Graph API and convert ALL failure modes to HTTPException
    with a JSON body so the frontend can always parse and display the error.

    GET responses are cached in-memory for 60 seconds (per token + path +
    params) so repeat calls within the TTL window return instantly. POSTs
    are never cached (they are mutations).

    Concurrent GETs for the same cache key are coalesced: only the
    first request actually hits FB, all other waiters block on the
    per-key lock and re-read the cache once it's populated. This
    prevents N×N stampede on `/api/accounts` and `/api/overview`
    when users open multiple tabs at once.
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

    # Serialise concurrent misses on the same key so we only pay the
    # FB round-trip once per window. The cache re-check INSIDE the
    # lock is important: the first holder puts the result into the
    # cache, later waiters enter the lock, see the cached entry, and
    # return immediately without a second FB call.
    if cache_key is not None:
        lock = _cache_lock(cache_key)
        async with lock:
            cached = _cache_get(cache_key)
            if cached is not None:
                return cached
            return await _fb_fetch_and_cache(
                method, path, params, data_payload, token, cache_key
            )

    return await _fb_fetch_and_cache(
        method, path, params, data_payload, token, cache_key
    )


async def _fb_fetch_and_cache(
    method: str,
    path: str,
    params: dict,
    data_payload: dict,
    token: str,
    cache_key: Optional[str],
) -> dict:
    """Inner FB call — issues the actual httpx request, handles the
    usual error pathways, and writes the result to the cache when
    ``cache_key`` is provided.
    """
    url = f"{BASE_URL}/{path}"
    try:
        if method == "GET":
            params = {"access_token": token, **params}
            r = await _http_client.get(url, params=params, timeout=_GET_TIMEOUT)
        else:
            data_payload = {"access_token": token, **data_payload}
            r = await _http_client.post(url, data=data_payload, timeout=_POST_TIMEOUT)
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

    Uses the same per-key stampede lock as :func:`_fb_request` so a
    burst of concurrent cache misses only pays for one FB call.
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

    lock = _cache_lock(cache_key)
    async with lock:
        # Re-check after acquiring — a concurrent waiter may have
        # populated the cache while we were blocked.
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
        return await _fb_get_paginated_fetch(path, params, token, cache_key)


async def _fb_get_paginated_fetch(
    path: str, params: dict, token: str, cache_key: str
) -> List[dict]:
    items: List[dict] = []
    next_url: Optional[str] = f"{BASE_URL}/{path}"
    page_params = {"access_token": token, **params}
    while next_url:
        try:
            r = await _http_client.get(next_url, params=page_params, timeout=_GET_TIMEOUT)
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

def _index_bytes() -> bytes:
    """Return the pre-cached React index.html. Read into memory at
    module import time, so this never touches disk at request time.
    If the React build is missing (e.g. `pnpm build` didn't run),
    returns a minimal placeholder so the server doesn't 500.
    """
    if _REACT_INDEX_HTML is not None:
        return _REACT_INDEX_HTML
    return b"<!doctype html><title>LURE Meta Platform</title><body>build missing</body>"


@app.get("/", response_class=HTMLResponse)
async def root():
    return Response(content=_index_bytes(), media_type="text/html; charset=utf-8")


@app.get("/api/_status")
async def app_status():
    """Diagnostic endpoint: confirms the server has a React build
    loaded. Hit this URL directly if "/" looks wrong.
    """
    return {
        "react_index_present": _REACT_BUILD_PRESENT,
        "react_assets_present": _REACT_ASSETS_PRESENT,
        "dist_dir": str(DIST_DIR),
    }


@app.get("/favicon.png")
async def favicon_png():
    if _FAVICON_PNG is None:
        raise HTTPException(status_code=404, detail="favicon missing")
    return Response(content=_FAVICON_PNG, media_type="image/png")


@app.get("/icon-192.png")
async def icon_192_png():
    if _ICON_192_PNG is None:
        raise HTTPException(status_code=404, detail="icon missing")
    return Response(content=_ICON_192_PNG, media_type="image/png")


@app.get("/icon-512.png")
async def icon_512_png():
    if _ICON_512_PNG is None:
        raise HTTPException(status_code=404, detail="icon missing")
    return Response(content=_ICON_512_PNG, media_type="image/png")


@app.get("/sw.js")
async def service_worker():
    """Serve the Workbox service worker Vite PWA emits into dist/.
    Cached at module import so this route never touches disk.
    """
    body = _SW_JS if _SW_JS is not None else b"// no service worker"
    return Response(content=body, media_type="application/javascript")


@app.get("/manifest.json")
async def manifest():
    """Serve the PWA manifest Vite PWA emits into dist/."""
    if _MANIFEST_JSON is not None:
        return Response(
            content=_MANIFEST_JSON,
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
        "limit": "500",
    })
    return {"data": accounts}


# ── 行銷活動 ─────────────────────────────────────────────────────────

async def _fetch_campaigns_for_account(
    account_id: str,
    date_preset: str,
    time_range: Optional[str],
    include_archived: bool,
) -> List[dict]:
    """Core campaign-fetch logic with FB-side progressive fallback.

    Extracted from the ``get_campaigns`` route so the same behavior
    (including the 4-tier retry chain) can be shared by the batch
    ``/api/overview`` endpoint without duplication. Returns the raw
    campaign list; the caller wraps it into whatever envelope shape
    it needs.

    Raises ``HTTPException`` if every tier fails so callers can
    decide whether to surface the error or swallow it for a
    partial-success response.
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
        attempts.append(("insights+archived", {"fields": full_fields, "limit": "500", **archived_filter}))
    attempts.append(("insights", {"fields": full_fields, "limit": "500"}))
    if include_archived:
        attempts.append(("no-insights+archived", {"fields": no_ins_fields, "limit": "500", **archived_filter}))
    attempts.append(("no-insights", {"fields": no_ins_fields, "limit": "500"}))
    attempts.append(("minimal", {"fields": "id,name,status", "limit": "500"}))

    last_error: Optional[HTTPException] = None
    for tier, params in attempts:
        try:
            camps = await fb_get_paginated(f"{account_id}/campaigns", params)
            if last_error is not None:
                print(
                    f"[campaigns] {account_id} recovered at tier={tier} "
                    f"after earlier failure: {last_error.detail}",
                    flush=True,
                )
            return camps
        except HTTPException as e:
            print(
                f"[campaigns] {account_id} tier={tier} failed: "
                f"{e.status_code} {e.detail}",
                flush=True,
            )
            last_error = e
            continue

    if last_error is not None:
        raise last_error
    raise HTTPException(status_code=502, detail="Failed to load campaigns from Facebook API")


@app.get("/api/accounts/{account_id}/campaigns")
async def get_campaigns(account_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None, include_archived: bool = False):
    """List campaigns for an account, with progressive fallback so a
    single FB-side restriction (e.g. effective_status not allowed on
    a particular ad account) doesn't make the whole call return 400.

    Delegates to :func:`_fetch_campaigns_for_account` so the batch
    ``/api/overview`` endpoint can share the same retry logic.
    """
    camps = await _fetch_campaigns_for_account(
        account_id, date_preset, time_range, include_archived
    )
    return {"data": camps}


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
            "limit": "500"
        })
    except Exception:
        # Fallback without insights if date query fails
        data = await fb_get(f"{campaign_id}/adsets", {
            "fields": "id,name,status,daily_budget,lifetime_budget",
            "limit": "500"
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
    # `effective_object_story_id` + `instagram_permalink_url` let the
    # preview modal show a "open original FB/IG post" link. They're
    # cheap string fields so we include them from tier 1 down until
    # FB forces us to drop creative entirely.
    # ``object_story_spec`` sub-fields are requested in an expanded
    # form so the frontend can tell an inline-authored dark post
    # (``link_data`` / ``photo_data`` / ``video_data`` / ``template_data``
    # populated) apart from an ad that reuses an existing organic
    # post (``object_story_spec`` absent or empty). Without these
    # fields the "前台貼文" badge misfires on every ad because FB
    # returns ``effective_object_story_id`` for everything.
    oss_expanded = (
        "object_story_spec{video_data,link_data,photo_data,template_data}"
    )
    # Note: ``creative{id,...}`` — we explicitly request the creative
    # id so the frontend can hit /api/creatives/{id}/hires-thumbnail
    # as a 600px fallback when /api/posts/{post_id}/media fails
    # (typically when the token lacks pages_read_engagement).
    attempts = [
        # Tier 1: everything — image_url for sharp still preview,
        # expanded object_story_spec so we can classify inline vs
        # front-stage, plus the two permalink fields.
        f"id,name,status,creative{{id,thumbnail_url,image_url,{oss_expanded},effective_object_story_id,instagram_permalink_url,title,body}},{ins}",
        # Tier 2: drop object_story_spec (some accounts reject it).
        f"id,name,status,creative{{id,thumbnail_url,image_url,effective_object_story_id,instagram_permalink_url,title,body}},{ins}",
        # Tier 3: drop image_url.
        f"id,name,status,creative{{id,thumbnail_url,effective_object_story_id,instagram_permalink_url,title,body}},{ins}",
        f"id,name,status,{ins}",
        "id,name,status",
    ]
    for fields in attempts:
        try:
            params = {"fields": fields, "limit": "500"}
            if "thumbnail_url" in fields:
                # 120px is 4× DPR for the 30×30 row icon displayed in
                # the Dashboard tree. Preview modal uses image_url
                # (full resolution) so shrinking thumbnail_url only
                # affects the tiny list icons — saves ~20× per-image
                # bytes.
                params["thumbnail_width"] = "120"
                params["thumbnail_height"] = "120"
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


@app.get("/api/posts/{post_id}/media")
async def get_post_media(post_id: str):
    """Fetch the full-resolution image / video source from a FB page post.

    Used by the 3rd-level creative preview modal when the ad is a
    "front-stage post" — i.e. it reuses an existing organic FB post
    instead of being authored inline via ``object_story_spec``.

    In the front-stage case the creative endpoint returns no
    ``image_url`` and no ``object_story_spec.video_data.video_id``;
    only a compressed ~120px ``thumbnail_url`` is available. Rendering
    that in the 520px modal looks blurry, and video ads can't play
    at all because we lack the video handle.

    Fetching ``/{post_id}?fields=full_picture,attachments{...}``
    directly returns the actual asset URLs from the underlying post:
      - ``full_picture`` — the post's hero image (highest res)
      - ``attachments[0].media.image.src`` — image asset CDN URL
      - ``attachments[0].media.source`` — playable video source
        (same kind of URL the /{video_id} edge would return)

    Errors are propagated back to the client as the ``error`` field
    so the frontend can tell the user what went wrong (typically
    "Insufficient permissions" — the default FB Login scopes don't
    include ``pages_read_engagement``, which is required to read
    arbitrary Page post content). The frontend then gracefully
    falls back to the 600px creative thumbnail path and, if even
    that fails, to a blurred thumbnail with a "view original post"
    call-to-action.
    """
    try:
        data = await fb_get(
            post_id,
            {
                "fields": (
                    "full_picture,"
                    "attachments{media_type,media{image{src},source}}"
                )
            },
        )
    except HTTPException as exc:
        # Pass the FB / Graph error detail back to the client so the
        # modal can decide what to fall back to and (optionally) show
        # a diagnostic. DON'T 500 the endpoint — a failed post fetch
        # is expected behavior when the token lacks pages_read_engagement.
        return {"image_url": None, "video_source": None, "error": str(exc.detail)}

    image_url: Optional[str] = None
    video_source: Optional[str] = None

    attachments = data.get("attachments") if isinstance(data, dict) else None
    if isinstance(attachments, dict):
        items = attachments.get("data") or []
        if items and isinstance(items, list):
            first = items[0]
            if isinstance(first, dict):
                media = first.get("media")
                if isinstance(media, dict):
                    # Video attachment — media.source is the playable URL
                    src = media.get("source")
                    if isinstance(src, str) and src:
                        video_source = src
                    # Image attachment — media.image.src is the full-res CDN URL
                    img = media.get("image")
                    if isinstance(img, dict):
                        img_src = img.get("src")
                        if isinstance(img_src, str) and img_src:
                            image_url = img_src

    # full_picture is the safest image fallback — always present on
    # image-style posts, unaffected by attachment structure variants.
    if not image_url:
        fp = data.get("full_picture") if isinstance(data, dict) else None
        if isinstance(fp, str) and fp:
            image_url = fp

    return {"image_url": image_url, "video_source": video_source, "error": None}


@app.get("/api/creatives/{creative_id}/hires-thumbnail")
async def get_creative_hires_thumbnail(creative_id: str, size: int = 600):
    """Return a larger-dimension server-rendered thumbnail for a single
    ``AdCreative`` via the FB-documented ``thumbnail_width`` /
    ``thumbnail_height`` params.

    These params are honored when you hit the creative edge directly
    (``/{creative_id}``) but NOT when you request ``thumbnail_url``
    through field expansion on the ad edge (that's why
    ``main.py:get_ads`` only gets a compressed ~120px icon).

    This endpoint is the graceful-degradation fallback for the
    preview modal when ``get_post_media`` fails (e.g. token lacks
    ``pages_read_engagement`` so we can't read the underlying post).
    The 600px version is **still a server-side preview**, not the
    original CDN source — so it can still look soft on large
    displays — but it's ~25× larger than the 120px row icon and
    usually looks fine at modal scale.

    ``size`` clamps to the 120..1080 range to keep pathological
    callers from hammering FB with enormous renders.
    """
    clamped = max(120, min(1080, int(size)))
    try:
        data = await fb_get(
            creative_id,
            {
                "fields": "thumbnail_url",
                "thumbnail_width": str(clamped),
                "thumbnail_height": str(clamped),
            },
        )
    except HTTPException as exc:
        return {"thumbnail_url": None, "error": str(exc.detail)}
    url = data.get("thumbnail_url") if isinstance(data, dict) else None
    return {"thumbnail_url": url if isinstance(url, str) and url else None, "error": None}


@app.get("/api/pages/{page_id}/info")
async def get_page_info(page_id: str):
    """Fetch the Facebook Page's display name + profile picture URL.

    Used by the 3rd-level creative preview modal so the dialog can
    render a "real FB post" header row (avatar + page name) instead
    of just the raw ad name. Called lazily from the frontend — only
    when the modal opens and the creative has an
    ``effective_object_story_id`` to extract the page id from.

    Returns ``{"name": str | None, "picture_url": str | None, "error": str | None}``.
    Errors are passed through to the client as the ``error`` field
    (not raised as HTTP errors) so a single unreachable page never
    blocks the preview from rendering the image and body text that
    we DO have. Most commonly the error is "insufficient
    permissions" — the default FB Login scopes
    (``ads_read,ads_management,business_management``) don't include
    ``pages_read_engagement`` which is what Graph requires to read
    arbitrary Page metadata.
    """
    try:
        data = await fb_get(page_id, {"fields": "name,picture.width(80).height(80)"})
    except HTTPException as exc:
        return {"name": None, "picture_url": None, "error": str(exc.detail)}
    picture = data.get("picture")
    picture_url = None
    if isinstance(picture, dict):
        inner = picture.get("data")
        if isinstance(inner, dict):
            picture_url = inner.get("url")
    return {"name": data.get("name"), "picture_url": picture_url, "error": None}


@app.post("/api/ads/{ad_id}/status")
async def update_ad_status(ad_id: str, status: str = Query(...)):
    return await fb_post(ad_id, {"status": status}, invalidate_entity=ad_id)


# ── 帳戶整體成效 ──────────────────────────────────────────────────────

async def _fetch_account_insights(
    account_id: str,
    date_preset: str,
    time_range: Optional[str],
) -> dict:
    """Core account-insights fetch. Returns the raw FB envelope
    (``{"data": [...], "paging": {...}}``) so callers can pluck the
    first entry or keep the full shape. Shared by the per-account
    route and the batch ``/api/overview`` endpoint.
    """
    params = {
        "fields": "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions",
    }
    if time_range:
        params["time_range"] = time_range
    else:
        params["date_preset"] = date_preset
    return await fb_get(f"{account_id}/insights", params)


@app.get("/api/accounts/{account_id}/insights")
async def get_account_insights(
    account_id: str,
    date_preset: str = "last_30d",
    time_range: Optional[str] = None,
):
    return await _fetch_account_insights(account_id, date_preset, time_range)


# ── 批次總覽（多帳戶並行）──────────────────────────────────────

@app.get("/api/overview")
async def get_overview(
    ids: str = Query(..., description="Comma-separated account ids (e.g. 'act_1,act_2')"),
    date_preset: str = "last_30d",
    time_range: Optional[str] = None,
    include_archived: bool = False,
):
    """Batch multi-account overview endpoint.

    Fetches campaigns + insights for *every* account in ``ids``
    concurrently on the backend via ``asyncio.gather`` and returns
    them in a single response. This consolidates what would otherwise
    be ``2 × N`` parallel browser requests (one campaigns call + one
    insights call per account) into a single client round-trip,
    completely bypassing the 6-connection-per-origin HTTP/1.1 limit
    that was the real bottleneck on Analytics / Alerts / Finance
    first-load — the slowest-account tail no longer queues behind
    other requests on the browser side, only on the backend-to-FB
    leg (where there's no 6-connection cap).

    Response shape::

        {
          "data": {
            "act_1": {
              "campaigns": [...],
              "insights": {...} | null,   # flat first entry
              "error": null | "message"
            },
            "act_2": {...}
          }
        }

    Per-account errors are captured (not raised) so one bad account
    doesn't blow up the whole batch — the caller can render partial
    data and surface errors inline.
    """
    account_ids = [aid.strip() for aid in ids.split(",") if aid.strip()]
    if not account_ids:
        return {"data": {}}

    async def _fetch_one(aid: str):
        """Campaigns + insights for one account in parallel. Sub-fetch
        failures are captured as an ``error`` string so the outer
        gather always resolves cleanly.
        """
        camps_task = asyncio.create_task(
            _fetch_campaigns_for_account(aid, date_preset, time_range, include_archived)
        )
        ins_task = asyncio.create_task(
            _fetch_account_insights(aid, date_preset, time_range)
        )
        await asyncio.gather(camps_task, ins_task, return_exceptions=True)

        error_parts: list[str] = []
        camps: List[dict] = []
        ins_flat: Optional[dict] = None

        camps_exc = camps_task.exception()
        if camps_exc is not None:
            detail = (
                camps_exc.detail if isinstance(camps_exc, HTTPException) else str(camps_exc)
            )
            error_parts.append(f"campaigns: {detail}")
        else:
            camps = camps_task.result()

        ins_exc = ins_task.exception()
        if ins_exc is not None:
            detail = (
                ins_exc.detail if isinstance(ins_exc, HTTPException) else str(ins_exc)
            )
            error_parts.append(f"insights: {detail}")
        else:
            raw = ins_task.result()
            items = raw.get("data") or [] if isinstance(raw, dict) else []
            ins_flat = items[0] if items else None

        return aid, {
            "campaigns": camps,
            "insights": ins_flat,
            "error": "; ".join(error_parts) if error_parts else None,
        }

    # Outer gather — N accounts concurrent. fetch_one catches its own
    # exceptions so return_exceptions isn't needed here.
    results = await asyncio.gather(*[_fetch_one(aid) for aid in account_ids])
    return {"data": dict(results)}


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
    # Served from module-level cached bytes — no disk read per request.
    return Response(content=_index_bytes(), media_type="text/html; charset=utf-8")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
