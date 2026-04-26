from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, List
from zoneinfo import ZoneInfo
import asyncio
import httpx
import os
from dotenv import load_dotenv
from pathlib import Path
from pydantic import BaseModel

import asyncpg

import line_client

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
# Shared asyncpg pool (created in lifespan when DATABASE_URL is set).
# None when running locally without a DB — the nickname endpoints return
# empty / 503 rather than crashing, so the rest of the app stays usable.
_db_pool: Optional[asyncpg.Pool] = None
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Limit concurrent outbound FB API calls to avoid hitting Facebook's
# per-app rate limit (~200 concurrent). 40 slots ≈ 20 accounts in
# parallel (2 calls each: campaigns + insights), safely under the cap.
# Without this, a cold /api/overview for 80 accounts fans out 160+
# simultaneous requests and routinely triggers 429 rate-limiting.
_fb_semaphore: asyncio.Semaphore = asyncio.Semaphore(40)

# ── LINE push scheduler ─────────────────────────────────────────────
# `_scheduler_task` holds the background asyncio task started in
# lifespan so we can cancel it cleanly on shutdown. The loop ticks
# every SCHEDULER_TICK_SECONDS and fires any push configs whose
# next_run_at has passed. 3 failures in a row flips `enabled=false`
# so a broken token doesn't spam the log forever.
_scheduler_task: Optional[asyncio.Task] = None
SCHEDULER_TICK_SECONDS = 60
SCHEDULER_FAIL_THRESHOLD = 3
SCHEDULER_TZ_NAME = os.getenv("SCHEDULER_TZ", "Asia/Taipei")


def _scheduler_tz() -> ZoneInfo:
    try:
        return ZoneInfo(SCHEDULER_TZ_NAME)
    except Exception:
        return ZoneInfo("Asia/Taipei")


def get_token() -> str:
    return _runtime_token or _ACCESS_TOKEN or ""


# Built React app output (from frontend/ via `pnpm build`). Served as
# the ONE and ONLY frontend — the legacy dashboard.html + the optional
# PostgreSQL user-settings sync were removed in the React-only cutover.
DIST_DIR = Path(__file__).parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_client, _db_pool
    # Per-request overrides in _fb_fetch_and_cache set the real
    # timeout (10s for GET, 30s for POST). This client-level value
    # is just a safety ceiling for any code path that slips through
    # without an explicit override.
    _http_client = httpx.AsyncClient(
        timeout=30,
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=40),
    )
    if DATABASE_URL:
        try:
            _db_pool = await asyncpg.create_pool(
                DATABASE_URL, min_size=1, max_size=5, command_timeout=10
            )
            async with _db_pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS campaign_nicknames (
                        campaign_id TEXT PRIMARY KEY,
                        store TEXT NOT NULL DEFAULT '',
                        designer TEXT NOT NULL DEFAULT '',
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                # Schema compatibility guard: the legacy build shipped a
                # different `user_settings` table (pre-2026-04-15 cutover).
                # CREATE TABLE IF NOT EXISTS silently skips when the table
                # exists, so a stale schema would leave INSERTs failing
                # with "column not found" and surface as an HTTP 500.
                # Detect a missing column and recreate the table.
                expected = {"fb_user_id", "key", "value", "updated_at"}
                existing = {
                    r["column_name"]
                    for r in await conn.fetch(
                        """
                        SELECT column_name FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'user_settings'
                        """
                    )
                }
                if existing and not expected.issubset(existing):
                    print(
                        f"[startup] DB: user_settings schema mismatch (has {sorted(existing)}),"
                        f" dropping + recreating",
                        flush=True,
                    )
                    await conn.execute("DROP TABLE IF EXISTS user_settings")
                # Per-user settings — keyed on (fb_user_id, key). Used
                # for things each person toggles privately: selected
                # accounts, account order, etc.
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS user_settings (
                        fb_user_id TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value JSONB NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (fb_user_id, key)
                    )
                    """
                )
                # Same defensive check for shared_settings.
                expected_shared = {"key", "value", "updated_at"}
                existing_shared = {
                    r["column_name"]
                    for r in await conn.fetch(
                        """
                        SELECT column_name FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'shared_settings'
                        """
                    )
                }
                if existing_shared and not expected_shared.issubset(existing_shared):
                    print(
                        f"[startup] DB: shared_settings schema mismatch (has {sorted(existing_shared)}),"
                        f" dropping + recreating",
                        flush=True,
                    )
                    await conn.execute("DROP TABLE IF EXISTS shared_settings")
                # Team-wide shared settings — single row per key, visible
                # to every user. Used for markup rules, pins, etc.
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS shared_settings (
                        key TEXT PRIMARY KEY,
                        value JSONB NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                # ── LINE push scheduler tables ────────────────────
                # gen_random_uuid() lives in pgcrypto on older PG. PG13+
                # has it in core, but enabling defensively is idempotent
                # and lets the CREATE TABLE below parse its DEFAULT on
                # managed providers that ship PG12.
                try:
                    await conn.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
                except Exception as exc:
                    print(f"[startup] DB: pgcrypto extension skipped ({exc})", flush=True)
                # `line_groups`: populated from the /api/line/webhook
                # join/leave events. We keep left_at instead of deleting
                # so existing push configs don't lose their FK target.
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS line_groups (
                        group_id TEXT PRIMARY KEY,
                        label TEXT NOT NULL DEFAULT '',
                        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        left_at TIMESTAMPTZ
                    )
                    """
                )
                # `campaign_line_push_configs`: one row per
                # (campaign_id, group_id) pair. `next_run_at` is the
                # index the scheduler tick scans; `frequency` + the
                # three discriminator columns (weekdays/month_day/
                # hour/minute) describe the recurrence rule.
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS campaign_line_push_configs (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        campaign_id TEXT NOT NULL,
                        account_id TEXT NOT NULL,
                        group_id TEXT NOT NULL REFERENCES line_groups(group_id),
                        frequency TEXT NOT NULL,
                        weekdays INT[] NOT NULL DEFAULT '{}',
                        month_day INT,
                        hour INT NOT NULL,
                        minute INT NOT NULL,
                        date_range TEXT NOT NULL DEFAULT 'last_7d',
                        enabled BOOLEAN NOT NULL DEFAULT TRUE,
                        last_run_at TIMESTAMPTZ,
                        next_run_at TIMESTAMPTZ NOT NULL,
                        last_error TEXT,
                        fail_count INT NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE (campaign_id, group_id)
                    )
                    """
                )
                # Partial index — scheduler tick only cares about
                # enabled rows.
                await conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_push_due
                    ON campaign_line_push_configs (next_run_at)
                    WHERE enabled
                    """
                )
                # `line_push_logs`: audit trail per push attempt, keeps
                # the last N entries per config for the "最近推播" UI.
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS line_push_logs (
                        id BIGSERIAL PRIMARY KEY,
                        config_id UUID REFERENCES campaign_line_push_configs(id) ON DELETE CASCADE,
                        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        success BOOLEAN NOT NULL,
                        error TEXT,
                        message_preview TEXT
                    )
                    """
                )
                # Diagnostic — print every table in the public schema
                # with its row count. Lets operators confirm at a
                # glance after a redeploy that the tables are present
                # AND that settings are actually landing.
                rows = await conn.fetch(
                    """
                    SELECT c.relname AS tbl,
                           COALESCE(s.n_live_tup, 0) AS approx_rows
                    FROM pg_class c
                    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                    WHERE c.relkind = 'r'
                      AND c.relnamespace = 'public'::regnamespace
                    ORDER BY c.relname
                    """
                )
                if rows:
                    print(
                        "[startup] DB tables: "
                        + ", ".join(f"{r['tbl']}({r['approx_rows']})" for r in rows),
                        flush=True,
                    )
                else:
                    print("[startup] DB tables: (none)", flush=True)
                # Exact counts for the three tables we own — these are
                # fresh after CREATE TABLE even if pg_stat hasn't caught
                # up with a recent INSERT yet.
                for tbl in (
                    "campaign_nicknames",
                    "user_settings",
                    "shared_settings",
                    "line_groups",
                    "campaign_line_push_configs",
                    "line_push_logs",
                ):
                    n = await conn.fetchval(f"SELECT COUNT(*) FROM {tbl}")
                    print(f"[startup] DB exact: {tbl} = {n} rows", flush=True)
            print("[startup] DB: OK (nicknames + settings + LINE push tables ready)", flush=True)
        except Exception as exc:
            _db_pool = None
            print(f"[startup] DB: FAILED ({exc})", flush=True)
    else:
        print("[startup] DB: SKIPPED (DATABASE_URL not set)", flush=True)

    # Start the LINE push scheduler loop only when the DB is available.
    # Without DB there's nothing to schedule off, so skip silently.
    global _scheduler_task
    if _db_pool is not None:
        _scheduler_task = asyncio.create_task(_scheduler_loop())
        print(
            f"[startup] scheduler: running, tick={SCHEDULER_TICK_SECONDS}s,"
            f" tz={SCHEDULER_TZ_NAME}",
            flush=True,
        )
    else:
        print("[startup] scheduler: SKIPPED (no DB)", flush=True)

    yield

    if _scheduler_task is not None:
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
        _scheduler_task = None
    await _http_client.aclose()
    _http_client = None
    if _db_pool is not None:
        await _db_pool.close()
        _db_pool = None


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
import json as _json
import re
import time

_CACHE_TTL_SECONDS = 60.0
# Accounts list changes very rarely (new ad accounts are onboarded
# manually); keep it cached for 10 minutes to stay well within FB's
# per-ad-account rate limits (80004). This is the single biggest
# request-reduction lever we have — every tab load used to pay one
# /api/accounts call against FB.
_ACCOUNTS_CACHE_TTL_SECONDS = 600.0
# Cache entry is (inserted_at, data, ttl). Older entries written with
# just (inserted_at, data) are migrated on read via _cache_get.
_fb_cache: dict[str, tuple[float, Any, float]] = {}
# Per-key request locks — when N concurrent requests miss the same
# cache key, the first one holds the lock and actually fans out to
# FB, while the rest await the lock and hit the now-populated cache
# on their retry. This prevents a cache stampede on /api/accounts and
# /api/overview, which every tab fires on first load.
_fb_cache_locks: dict[str, asyncio.Lock] = {}

# Latest FB rate-limit usage snapshot, parsed from the
# `X-Business-Use-Case-Usage` response header. Key = business id (the
# outer JSON key FB uses); value = dict with the highest observed
# `call_count` / `total_cputime` / `total_time` percentages plus
# `estimated_time_to_regain_access` (minutes) and the timestamp of
# the reading. Exposed via `/api/fb-usage` so the frontend can warn
# the user before they hit 100% or show how long to wait after a
# rate-limit error.
_fb_usage: dict[str, dict[str, Any]] = {}


def _parse_bucu_header(raw: Optional[str]) -> None:
    """Parse `X-Business-Use-Case-Usage` into `_fb_usage`.

    FB docs: https://developers.facebook.com/docs/graph-api/overview/rate-limiting#headers
    Header is a JSON object mapping business id → list of usage entries
    (one per call type: ads_management / ads_insights / ...). Each entry
    reports percent usage against FB's 100% ceiling, plus
    `estimated_time_to_regain_access` in minutes (0 when not throttled).

    Silently ignored when the header is missing or malformed — FB
    doesn't promise it on every response and we don't want a bad
    header format to break the actual data call.
    """
    if not raw:
        return
    try:
        parsed = _json.loads(raw)
    except Exception:
        return
    if not isinstance(parsed, dict):
        return
    now = time.time()
    for biz_id, entries in parsed.items():
        if not isinstance(entries, list):
            continue
        peak = {"call_count": 0, "total_cputime": 0, "total_time": 0}
        regain = 0
        call_type = ""
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for k in peak:
                try:
                    peak[k] = max(peak[k], int(entry.get(k, 0) or 0))
                except (TypeError, ValueError):
                    continue
            try:
                regain = max(regain, int(entry.get("estimated_time_to_regain_access", 0) or 0))
            except (TypeError, ValueError):
                pass
            if not call_type:
                call_type = str(entry.get("type", "") or "")
        _fb_usage[str(biz_id)] = {
            **peak,
            "estimated_time_to_regain_access": regain,
            "type": call_type,
            "observed_at": now,
        }


def _peak_regain_minutes() -> int:
    """Largest `estimated_time_to_regain_access` across all businesses
    in the last snapshot. Returned to the client alongside rate-limit
    errors so the UI can say "try again in N minutes" instead of a
    generic "rate limited" message.
    """
    if not _fb_usage:
        return 0
    return max(
        int(u.get("estimated_time_to_regain_access", 0) or 0) for u in _fb_usage.values()
    )


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
    inserted_at, data, ttl = entry
    if (time.monotonic() - inserted_at) > ttl:
        _fb_cache.pop(key, None)
        _fb_cache_locks.pop(key, None)
        return None
    return data


def _cache_put(key: str, data: Any, ttl: float = _CACHE_TTL_SECONDS) -> None:
    # Best-effort eviction: cap cache at 500 entries to avoid runaway
    # memory growth across long-running sessions.
    if len(_fb_cache) > 500:
        # Drop the oldest 100 entries to make room
        oldest = sorted(_fb_cache.items(), key=lambda kv: kv[1][0])[:100]
        for k, _ in oldest:
            _fb_cache.pop(k, None)
            _fb_cache_locks.pop(k, None)
    _fb_cache[key] = (time.monotonic(), data, ttl)


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


# Per-method httpx timeouts.
#
# FAST — for single-entity lookups where a human is waiting (video
# source, page info, creative hires thumbnail). Fails in 10s so a
# slow response doesn't freeze the preview modal open.
#
# BULK — for the heavy fan-out endpoints (`/api/overview` hitting
# 80 accounts in parallel, `/api/accounts` enumerating adaccounts).
# FB's insights endpoint for a large account routinely takes 5-15s
# under load; pair that with ~160 concurrent requests during a
# cold page-load and the FB side starts throttling, which pushes
# the slowest tail into the 10-20s range. 20s here keeps slow
# accounts from being intermittently mislabeled as "errored".
#
# POST — mutations tolerate the old 30s budget because FB's write
# path occasionally lags.
_GET_TIMEOUT_FAST = 10.0
_GET_TIMEOUT_BULK = 20.0
_POST_TIMEOUT = 30.0

# How many times to retry a transient FB failure before surfacing
# the error to the client. 1 extra attempt doubles the latency
# ceiling in the worst case but hugely improves success rate for
# the "sometimes works, sometimes doesn't" category of errors
# (429 rate-limited, 5xx upstream blip, connection reset, timeout).
_FB_MAX_RETRIES = 1
_FB_RETRY_DELAY_S = 0.5


def _is_transient_fb_error(exc: HTTPException) -> bool:
    """Heuristic for "worth retrying once" FB failures.

    We retry on:
      - 429  rate-limited
      - 500  upstream internal error
      - 502  bad gateway (our own "can't reach FB" wrapper code)
      - 503  service unavailable
      - 504  gateway timeout (includes the httpx TimeoutException wrap)

    We do NOT retry on 400 — that's usually a real FB API rejection
    (bad field, permission denied, unknown objective) that won't
    get better on a retry and would just double the wait for the
    user. Same for 401 (token expired) and 404 (entity gone).
    """
    return exc.status_code in (429, 500, 502, 503, 504)


async def _fb_request(
    method: str,
    path: str,
    params: Optional[dict] = None,
    data_payload: Optional[dict] = None,
    *,
    slow_ok: bool = False,
) -> dict:
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

    ``slow_ok=True`` switches to the bulk 20s timeout — used by
    heavy fan-out call sites (``_fetch_account_insights``,
    ``_fetch_campaigns_for_account``) where FB's upstream latency
    routinely exceeds 10s during cold-load bursts. Single-entity
    lookups (video source, page info, hires thumbnail) leave the
    default 10s to fail fast.
    """
    if params is None:
        params = {}
    if data_payload is None:
        data_payload = {}
    token = get_token()
    if not token:
        raise HTTPException(status_code=401, detail="Facebook access token not set. Please log in.")

    get_timeout = _GET_TIMEOUT_BULK if slow_ok else _GET_TIMEOUT_FAST

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
            return await _fb_fetch_with_retry(
                method, path, params, data_payload, token, cache_key, get_timeout
            )

    return await _fb_fetch_with_retry(
        method, path, params, data_payload, token, cache_key, get_timeout
    )


async def _fb_fetch_with_retry(
    method: str,
    path: str,
    params: dict,
    data_payload: dict,
    token: str,
    cache_key: Optional[str],
    get_timeout: float,
) -> dict:
    """Wrap :func:`_fb_fetch_and_cache` with a single retry on
    transient upstream errors (429 / 5xx / network timeout / connect
    reset). Dashboard fan-out endpoints routinely see 1-2% of calls
    blip on the FB side; retrying after a 500ms backoff recovers
    almost all of them and turns the "sometimes works, sometimes
    doesn't" complaint into something that just works.

    The retry is BEST-EFFORT: if the second attempt also fails we
    surface the LATER error so callers see the most recent state.
    """
    last_exc: Optional[HTTPException] = None
    for attempt in range(_FB_MAX_RETRIES + 1):
        try:
            return await _fb_fetch_and_cache(
                method, path, params, data_payload, token, cache_key, get_timeout
            )
        except HTTPException as e:
            last_exc = e
            if attempt >= _FB_MAX_RETRIES or not _is_transient_fb_error(e):
                raise
            print(
                f"[fb] transient {e.status_code} on {path} "
                f"(attempt {attempt + 1}/{_FB_MAX_RETRIES + 1}): {e.detail}",
                flush=True,
            )
            await asyncio.sleep(_FB_RETRY_DELAY_S)
    # Unreachable: the loop either returns or raises, but mypy / lint
    # likes an explicit exit.
    raise last_exc if last_exc else HTTPException(status_code=500, detail="fb retry exhausted")


async def _fb_fetch_and_cache(
    method: str,
    path: str,
    params: dict,
    data_payload: dict,
    token: str,
    cache_key: Optional[str],
    get_timeout: float = _GET_TIMEOUT_FAST,
) -> dict:
    """Inner FB call — issues the actual httpx request, handles the
    usual error pathways, and writes the result to the cache when
    ``cache_key`` is provided.
    """
    url = f"{BASE_URL}/{path}"
    async with _fb_semaphore:
        try:
            if method == "GET":
                params = {"access_token": token, **params}
                r = await _http_client.get(url, params=params, timeout=get_timeout)
            else:
                data_payload = {"access_token": token, **data_payload}
                r = await _http_client.post(url, data=data_payload, timeout=_POST_TIMEOUT)
        except httpx.TimeoutException as e:
            raise HTTPException(status_code=504, detail=f"Facebook API timeout: {e}")
        except httpx.RequestError as e:
            # Includes ConnectError, ProxyError, NetworkError, etc.
            raise HTTPException(status_code=502, detail=f"Cannot reach Facebook API: {type(e).__name__}: {e}")
    # Record rate-limit usage regardless of success/error — the header
    # is present on error responses too and is how we know when it's
    # safe to retry.
    _parse_bucu_header(r.headers.get("x-business-use-case-usage"))
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


async def fb_get(path: str, params: Optional[dict] = None, *, slow_ok: bool = False) -> dict:
    return await _fb_request("GET", path, params=params, slow_ok=slow_ok)


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


async def fb_get_paginated(
    path: str,
    params: Optional[dict] = None,
    *,
    ttl: float = _CACHE_TTL_SECONDS,
) -> List[dict]:
    """Paginate through a FB Graph API endpoint that returns {data:[], paging:{next}}.
    Always raises HTTPException on failure (never lets httpx errors bubble up as 500).

    Final result lists are cached in-memory for ``ttl`` seconds (default 60s,
    per token + path + initial params). Subsequent calls within the TTL window
    return without hitting Facebook at all — a major speedup for the heavy
    /api/accounts and /api/accounts/{id}/campaigns endpoints. Endpoints whose
    underlying data changes very slowly (e.g. the ad-account list) pass a
    longer TTL to stay further below FB's per-account rate limit.

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
        return await _fb_get_paginated_fetch(path, params, token, cache_key, ttl)


async def _fb_get_paginated_fetch(
    path: str, params: dict, token: str, cache_key: str, ttl: float = _CACHE_TTL_SECONDS
) -> List[dict]:
    """Walk FB paging.next until exhausted. Per-page GETs use the
    **bulk** timeout (20s) because this function backs the heavy
    `/api/accounts` and `/api/accounts/{id}/campaigns` endpoints
    where slow FB responses were intermittently tripping the
    tighter 10s budget. Each page is also retried once on
    transient (5xx / 429 / timeout / connection) failures.
    """
    items: List[dict] = []
    next_url: Optional[str] = f"{BASE_URL}/{path}"
    page_params = {"access_token": token, **params}
    while next_url:
        data: Optional[dict] = None
        last_exc: Optional[HTTPException] = None
        # Per FB best practices, ads-specific account throttles
        # (80000-80014) must NOT be retried — continuing calls
        # extends the lockout. Flag is set inline when we see one.
        no_retry = False
        for attempt in range(_FB_MAX_RETRIES + 1):
            try:
                async with _fb_semaphore:
                    r = await _http_client.get(
                        next_url, params=page_params, timeout=_GET_TIMEOUT_BULK
                    )
            except httpx.TimeoutException as e:
                last_exc = HTTPException(status_code=504, detail=f"Facebook API timeout: {e}")
            except httpx.RequestError as e:
                last_exc = HTTPException(
                    status_code=502,
                    detail=f"Cannot reach Facebook API: {type(e).__name__}: {e}",
                )
            else:
                _parse_bucu_header(r.headers.get("x-business-use-case-usage"))
                try:
                    data = r.json()
                except Exception:
                    snippet = (r.text or "")[:300]
                    last_exc = HTTPException(
                        status_code=502,
                        detail=f"Facebook API returned non-JSON (HTTP {r.status_code}): {snippet}",
                    )
                    data = None
                if data is not None and isinstance(data, dict) and "error" in data:
                    err = data["error"] if isinstance(data["error"], dict) else {}
                    msg = err.get("message", "Facebook API error")
                    code = err.get("code")
                    # Code 4 / 17 / 32 / 613 are app/user/page-level
                    # rate-limit codes — treat as transient so we
                    # retry once. Code 80000-80014 are ads-specific
                    # ad-account throttles; per FB best practices we
                    # do NOT retry them (continuing calls extends the
                    # lockout) — surface 429 with the wait time and
                    # let the frontend show "try again in N minutes".
                    transient_fb_codes = {4, 17, 32, 613}
                    is_ads_throttle = isinstance(code, int) and 80000 <= code <= 80014
                    if code in transient_fb_codes:
                        http_status = 429
                    elif is_ads_throttle:
                        http_status = 429
                    else:
                        http_status = 400
                    detail = f"{msg} [code={code}]" if code else msg
                    if is_ads_throttle:
                        no_retry = True
                        wait_min = _peak_regain_minutes()
                        if wait_min:
                            detail = f"{detail} [retry_after_minutes={wait_min}]"
                    last_exc = HTTPException(status_code=http_status, detail=detail)
                    data = None
            if data is not None:
                last_exc = None
                break  # success, stop retrying
            # Decide whether to retry this failure
            if no_retry or last_exc is None or not _is_transient_fb_error(last_exc):
                break
            if attempt >= _FB_MAX_RETRIES:
                break
            print(
                f"[fb paged] transient {last_exc.status_code} on {path} "
                f"(attempt {attempt + 1}/{_FB_MAX_RETRIES + 1}): {last_exc.detail}",
                flush=True,
            )
            await asyncio.sleep(_FB_RETRY_DELAY_S)
        if last_exc is not None:
            raise last_exc
        assert data is not None
        items.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        page_params = {}  # next_url already contains all params
    _cache_put(cache_key, items, ttl)
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
        # Get basic profile
        me = await fb_get("me", {"fields": "id,name,picture"})
        pic = me.get("picture", {}).get("data", {}).get("url")
        return {"ok": True, "name": me.get("name"), "id": me.get("id"), "pictureUrl": pic}
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


# ── Campaign Nicknames (PostgreSQL-backed) ────────────────────────────
#
# Stored in `campaign_nicknames` (campaign_id PK). Global / shared
# across all authenticated users — the LURE team uses a single shared
# nickname list per campaign.

class NicknamePayload(BaseModel):
    store: str = ""
    designer: str = ""


def _require_db() -> asyncpg.Pool:
    if _db_pool is None:
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set DATABASE_URL and redeploy.",
        )
    return _db_pool


@app.get("/api/nicknames")
async def list_nicknames():
    if _db_pool is None:
        return {"data": []}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT campaign_id, store, designer FROM campaign_nicknames"
        )
    return {
        "data": [
            {"campaign_id": r["campaign_id"], "store": r["store"], "designer": r["designer"]}
            for r in rows
        ]
    }


@app.post("/api/nicknames/{campaign_id}")
async def upsert_nickname(campaign_id: str, payload: NicknamePayload):
    pool = _require_db()
    store = (payload.store or "").strip()
    designer = (payload.designer or "").strip()
    async with pool.acquire() as conn:
        if not store and not designer:
            # Both empty → treat as delete so we don't keep ghost rows
            await conn.execute(
                "DELETE FROM campaign_nicknames WHERE campaign_id = $1",
                campaign_id,
            )
            return {"ok": True, "deleted": True}
        await conn.execute(
            """
            INSERT INTO campaign_nicknames (campaign_id, store, designer, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (campaign_id) DO UPDATE
            SET store = EXCLUDED.store,
                designer = EXCLUDED.designer,
                updated_at = NOW()
            """,
            campaign_id,
            store,
            designer,
        )
    return {"ok": True, "campaign_id": campaign_id, "store": store, "designer": designer}


@app.delete("/api/nicknames/{campaign_id}")
async def delete_nickname(campaign_id: str):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM campaign_nicknames WHERE campaign_id = $1",
            campaign_id,
        )
    return {"ok": True}


# ── Settings (PostgreSQL-backed) ──────────────────────────────────────
#
# Two scopes:
#   - user_settings: keyed on (fb_user_id, key). Each user owns their
#     own row. Used for: selected accounts, account order.
#   - shared_settings: keyed on key only, visible to every user. Used
#     for: finance row markups, pinned ids, default markup, show
#     nicknames toggle.
#
# `fb_user_id` is passed by the frontend — it's the FB /me id that the
# frontend already has after login. The backend trusts it (this is an
# internal agency tool; the blast radius of a forged user id is another
# person's private settings, not data exposure).

import json


class SettingsValuePayload(BaseModel):
    value: Any


@app.get("/api/settings/user/{fb_user_id}")
async def get_user_settings(fb_user_id: str):
    if _db_pool is None:
        return {"data": {}}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT key, value FROM user_settings WHERE fb_user_id = $1",
            fb_user_id,
        )
    # asyncpg returns the jsonb column as a str; decode to the real
    # Python object so the JSON response is nested, not a string.
    return {
        "data": {
            r["key"]: (json.loads(r["value"]) if isinstance(r["value"], str) else r["value"])
            for r in rows
        }
    }


@app.post("/api/settings/user/{fb_user_id}/{key}")
async def upsert_user_setting(fb_user_id: str, key: str, payload: SettingsValuePayload):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_settings (fb_user_id, key, value, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW())
            ON CONFLICT (fb_user_id, key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = NOW()
            """,
            fb_user_id,
            key,
            json.dumps(payload.value),
        )
    print(f"[settings] user POST uid={fb_user_id!r} key={key!r}", flush=True)
    return {"ok": True}


@app.delete("/api/settings/user/{fb_user_id}/{key}")
async def delete_user_setting(fb_user_id: str, key: str):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM user_settings WHERE fb_user_id = $1 AND key = $2",
            fb_user_id,
            key,
        )
    return {"ok": True}


@app.get("/api/settings/shared")
async def get_shared_settings():
    if _db_pool is None:
        return {"data": {}}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM shared_settings")
    return {
        "data": {
            r["key"]: (json.loads(r["value"]) if isinstance(r["value"], str) else r["value"])
            for r in rows
        }
    }


@app.post("/api/settings/shared/{key}")
async def upsert_shared_setting(key: str, payload: SettingsValuePayload):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO shared_settings (key, value, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = NOW()
            """,
            key,
            json.dumps(payload.value),
        )
    print(f"[settings] shared POST key={key!r}", flush=True)
    return {"ok": True}


# ── Debug dump endpoint ───────────────────────────────────────────────
#
# Curl-able from a browser / fetch() so the user can see:
#   - whether DATABASE_URL is live
#   - what fb_user_id currently owns which user_settings rows
#   - what shared_settings are stored
#   - how many campaign_nicknames exist
# Returns redacted output (no value payloads that might contain secrets,
# though our data is already non-sensitive). Useful for diagnosing
# "saved settings didn't come back".

@app.get("/api/_debug/settings")
async def debug_settings_dump():
    if _db_pool is None:
        return {"db": "not_configured", "database_url_set": bool(DATABASE_URL)}
    out: dict = {"db": "connected"}
    async with _db_pool.acquire() as conn:
        user_rows = await conn.fetch(
            "SELECT fb_user_id, key, value, updated_at FROM user_settings ORDER BY updated_at DESC"
        )
        shared_rows = await conn.fetch(
            "SELECT key, value, updated_at FROM shared_settings ORDER BY updated_at DESC"
        )
        nickname_count = await conn.fetchval("SELECT COUNT(*) FROM campaign_nicknames")
    out["user_settings"] = [
        {
            "fb_user_id": r["fb_user_id"],
            "key": r["key"],
            "value": (json.loads(r["value"]) if isinstance(r["value"], str) else r["value"]),
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in user_rows
    ]
    out["shared_settings"] = [
        {
            "key": r["key"],
            "value": (json.loads(r["value"]) if isinstance(r["value"], str) else r["value"]),
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in shared_rows
    ]
    out["campaign_nicknames_count"] = nickname_count
    return out


@app.delete("/api/settings/shared/{key}")
async def delete_shared_setting(key: str):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM shared_settings WHERE key = $1", key)
    return {"ok": True}


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
    # The `campaigns.limit(0).summary(true)` subfield was removed: FB
    # computes that summary per-account which was the main trigger for
    # 80004 (per-ad-account throttling) under cold-load bursts. The
    # frontend doesn't actually use `campaign_count`.
    accounts = await fb_get_paginated(
        "me/adaccounts",
        {
            "fields": "id,name,account_status,currency,timezone_name,business",
            "limit": "500",
        },
        ttl=_ACCOUNTS_CACHE_TTL_SECONDS,
    )
    return {"data": accounts}


@app.get("/api/fb-usage")
async def get_fb_usage():
    """Latest parsed `X-Business-Use-Case-Usage` snapshot.

    Populated as a side-effect of every FB call. Entries expire on
    their own (FB re-sends the header on subsequent calls with fresh
    numbers); we don't age them out on our side because "last known
    value" is what the UI wants anyway.
    """
    return {"data": _fb_usage, "peak_regain_minutes": _peak_regain_minutes()}


# ── 行銷活動 ─────────────────────────────────────────────────────────

async def _fetch_campaigns_for_account(
    account_id: str,
    date_preset: str,
    time_range: Optional[str],
    include_archived: bool,
    lite: bool = False,
) -> List[dict]:
    """Core campaign-fetch logic with FB-side progressive fallback.

    Extracted from the ``get_campaigns`` route so the same behavior
    (including the 4-tier retry chain) can be shared by the batch
    ``/api/overview`` endpoint without duplication. Returns the raw
    campaign list; the caller wraps it into whatever envelope shape
    it needs.

    When ``lite=True``, skips the insights field expansion entirely
    and only fetches campaign metadata (name, status, budget). This
    is much faster (~1-2s vs ~5-15s) and is used for the two-phase
    loading pattern: show campaign rows immediately, then backfill
    insights from the full request.

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

    # Lite mode: skip insights entirely for fast first-paint.
    if lite:
        params: dict = {"fields": no_ins_fields, "limit": "500"}
        if include_archived:
            params.update(archived_filter)
        return await fb_get_paginated(f"{account_id}/campaigns", params)

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
    if daily_budget is not None:
        payload["daily_budget"] = str(daily_budget)
    if lifetime_budget is not None:
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
    except HTTPException:
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
    if daily_budget is not None:
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

    ``slow_ok=True`` because FB's insights endpoint for a large
    account is one of the slowest fan-out paths in the dashboard:
    under parallel load during a cold page-load it routinely
    takes 10-15s before returning, which was pushing the old 10s
    GET timeout into "sometimes works, sometimes doesn't" territory.
    """
    params = {
        "fields": "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions",
    }
    if time_range:
        params["time_range"] = time_range
    else:
        params["date_preset"] = date_preset
    return await fb_get(f"{account_id}/insights", params, slow_ok=True)


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
    lite: bool = False,
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

        In ``lite`` mode, only campaign metadata is fetched (no insights)
        so the frontend can show campaign rows within ~1-2s. The full
        data follows from a parallel non-lite request.
        """
        camps_task = asyncio.create_task(
            _fetch_campaigns_for_account(aid, date_preset, time_range, include_archived, lite=lite)
        )
        if lite:
            # Lite mode: skip the insights call entirely for speed.
            try:
                camps = await camps_task
            except (HTTPException, Exception) as e:
                detail = e.detail if isinstance(e, HTTPException) else str(e)
                return aid, {"campaigns": [], "insights": None, "error": f"campaigns: {detail}"}
            return aid, {"campaigns": camps, "insights": None, "error": None}

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

    # Outer gather — N accounts concurrent. Each _fetch_one is wrapped
    # in a 30-second timeout so one slow account (e.g. stuck in the
    # 5-tier campaign fallback chain) can't hold up the entire batch.
    # Timed-out accounts get an error entry; faster accounts still
    # return data normally.
    async def _fetch_one_bounded(aid: str):
        try:
            return await asyncio.wait_for(_fetch_one(aid), timeout=30.0)
        except asyncio.TimeoutError:
            return aid, {
                "campaigns": [],
                "insights": None,
                "error": "timeout: account took more than 30s",
            }

    results = await asyncio.gather(*[_fetch_one_bounded(aid) for aid in account_ids])
    return {"data": dict(results)}


# ── LINE push scheduler ───────────────────────────────────────
#
# Persistence model:
#   - `line_groups`  : (group_id, label, joined_at, left_at)
#   - `campaign_line_push_configs`
#   - `line_push_logs`
#
# Flow:
#   1. LINE bot added to a group → LINE sends `join` webhook
#      → /api/line/webhook upserts line_groups row
#   2. User opens LinePushModal on a campaign row, picks a group
#      + frequency + time → POST /api/line-push/configs
#   3. Scheduler loop (_scheduler_loop) ticks every 60s, selects
#      rows with next_run_at <= now AND enabled, pushes a Flex
#      Message via line_client.line_push(), advances next_run_at
#   4. 3 consecutive failures flip `enabled=false` so a broken
#      token / revoked group doesn't keep retrying forever

FREQUENCY_DAILY = "daily"
FREQUENCY_WEEKLY = "weekly"
FREQUENCY_MONTHLY = "monthly"
_VALID_FREQUENCIES = {FREQUENCY_DAILY, FREQUENCY_WEEKLY, FREQUENCY_MONTHLY}
_VALID_DATE_RANGES = {"yesterday", "last_7d", "last_14d", "last_30d", "this_month"}


def _compute_next_run(
    frequency: str,
    weekdays: List[int],
    month_day: Optional[int],
    hour: int,
    minute: int,
    *,
    after: Optional[datetime] = None,
) -> datetime:
    """Return the next run timestamp (UTC) strictly after `after`.

    All scheduling is expressed in the user's local timezone
    (`SCHEDULER_TZ`, default Asia/Taipei). We compute the next
    matching local datetime then convert back to UTC for storage.
    """
    tz = _scheduler_tz()
    now_local = (after or datetime.now(timezone.utc)).astimezone(tz)

    def at(d: datetime) -> datetime:
        return d.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if frequency == FREQUENCY_DAILY:
        candidate = at(now_local)
        if candidate <= now_local:
            candidate = at(now_local + timedelta(days=1))
        return candidate.astimezone(timezone.utc)

    if frequency == FREQUENCY_WEEKLY:
        # Python weekday(): Monday=0..Sunday=6. We store 0=Sunday..6=Saturday
        # to match JS `Date.getDay()`, so translate.
        wanted = set(weekdays or [])
        if not wanted:
            # Fall back to daily to avoid an infinite loop.
            return _compute_next_run(FREQUENCY_DAILY, [], None, hour, minute, after=after)
        for offset in range(0, 8):
            probe = now_local + timedelta(days=offset)
            py_dow = probe.weekday()  # Mon=0
            js_dow = (py_dow + 1) % 7  # Sun=0
            if js_dow not in wanted:
                continue
            candidate = at(probe)
            if candidate > now_local:
                return candidate.astimezone(timezone.utc)
        # Unreachable — 8 days is >= 1 full week.
        return (now_local + timedelta(days=7)).astimezone(timezone.utc)

    if frequency == FREQUENCY_MONTHLY:
        day = max(1, min(28, month_day or 1))
        year, month = now_local.year, now_local.month
        for _ in range(2):
            candidate = now_local.replace(
                year=year, month=month, day=day,
                hour=hour, minute=minute, second=0, microsecond=0,
            )
            if candidate > now_local:
                return candidate.astimezone(timezone.utc)
            month += 1
            if month > 12:
                month = 1
                year += 1
        # Unreachable — 2 months ahead always beats `now`.
        return (now_local + timedelta(days=31)).astimezone(timezone.utc)

    raise HTTPException(status_code=400, detail=f"Unknown frequency: {frequency}")


def _date_range_to_preset(date_range: str) -> tuple[str, Optional[str]]:
    """Map the UI's date_range choice to FB insights (date_preset, time_range)."""
    if date_range == "yesterday":
        return ("yesterday", None)
    if date_range == "last_7d":
        return ("last_7d", None)
    if date_range == "last_14d":
        return ("last_14d", None)
    if date_range == "last_30d":
        return ("last_30d", None)
    if date_range == "this_month":
        return ("this_month", None)
    return ("last_7d", None)


def _date_range_label(date_range: str) -> str:
    return {
        "yesterday": "昨日",
        "last_7d": "過去 7 天",
        "last_14d": "過去 14 天",
        "last_30d": "過去 30 天",
        "this_month": "本月",
    }.get(date_range, date_range)


def _extract_msg_count(actions: Any) -> int:
    """Mirror of frontend getMsgCount — first-found wins."""
    if not isinstance(actions, list):
        return 0
    keys = (
        "onsite_conversion.messaging_conversation_started_7d",
        "messaging_conversation_started_7d",
    )
    for k in keys:
        for a in actions:
            if isinstance(a, dict) and a.get("action_type") == k:
                try:
                    return int(float(a.get("value", 0)))
                except (TypeError, ValueError):
                    return 0
    return 0


def _fmt_money(v: Any) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"${n:,.0f}"


def _fmt_int(v: Any) -> str:
    try:
        n = int(float(v or 0))
    except (TypeError, ValueError):
        return "—"
    return f"{n:,}"


def _fmt_pct(v: Any) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"{n:.2f}%"


async def _build_flex_for_config(cfg: dict) -> dict:
    """Produce the LINE Flex Message for one push config row.

    Pulls the campaign via _fetch_campaigns_for_account and picks the
    matching one by id. `_fetch_account_insights` would give an
    account-level roll-up; we use per-campaign insights instead so
    the recipient sees the exact campaign they're subscribed to.
    """
    account_id = cfg["account_id"]
    campaign_id = cfg["campaign_id"]
    date_range = cfg["date_range"]
    date_preset, time_range = _date_range_to_preset(date_range)

    campaigns = await _fetch_campaigns_for_account(
        account_id, date_preset, time_range, include_archived=True, lite=False
    )
    camp = next((c for c in campaigns if c.get("id") == campaign_id), None)
    if camp is None:
        raise RuntimeError(f"Campaign {campaign_id} not found under {account_id}")

    ins_list = (camp.get("insights") or {}).get("data") or []
    ins = ins_list[0] if ins_list else {}
    spend = ins.get("spend") or 0
    msgs = _extract_msg_count(ins.get("actions"))

    kpis: list[tuple[str, str]] = [
        ("花費", _fmt_money(spend)),
        ("曝光", _fmt_int(ins.get("impressions"))),
        ("點擊", _fmt_int(ins.get("clicks"))),
        ("CTR", _fmt_pct(ins.get("ctr"))),
        ("CPC", _fmt_money(ins.get("cpc"))),
        ("私訊數", _fmt_int(msgs) if msgs > 0 else "—"),
    ]
    if msgs > 0:
        try:
            cost_per_msg = float(spend) / msgs
        except (TypeError, ValueError):
            cost_per_msg = 0.0
        kpis.append(("私訊成本", _fmt_money(cost_per_msg)))

    # Look up the account display name (for the header subtitle).
    account_name = account_id
    try:
        accts = await fb_get("me/adaccounts", {"fields": "id,name", "limit": "500"})
        for a in accts.get("data", []):
            if a.get("id") == account_id:
                account_name = a.get("name", account_id)
                break
    except Exception:
        pass

    return line_client.build_flex_report(
        campaign_name=camp.get("name", campaign_id),
        account_name=account_name,
        date_label=_date_range_label(date_range),
        kpis=kpis,
        alt_text=f"{camp.get('name', campaign_id)} {_date_range_label(date_range)}",
    )


# ── LINE webhook ──────────────────────────────────────────────

@app.post("/api/line/webhook")
async def line_webhook(request: Request):
    """Receive LINE join/leave events and upsert line_groups rows.

    LINE Platform expects a <10s 200 OK response. We do the minimum
    here (verify signature, write DB) and return fast. Any parsing
    error is swallowed and still returns 200 to keep LINE from
    retrying aggressively.
    """
    raw = await request.body()
    sig = request.headers.get("X-Line-Signature")
    if not line_client.verify_webhook_signature(raw, sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if _db_pool is None:
        # Still 200 so LINE doesn't retry; operator can fix DB later.
        return {"ok": True, "skipped": "no DB"}

    try:
        payload = await request.json()
    except Exception:
        return {"ok": True, "skipped": "non-json body"}

    events = payload.get("events") or []
    async with _db_pool.acquire() as conn:
        for ev in events:
            if not isinstance(ev, dict):
                continue
            etype = ev.get("type")
            source = ev.get("source") or {}
            if source.get("type") != "group":
                continue
            group_id = source.get("groupId")
            if not group_id:
                continue
            if etype == "join":
                await conn.execute(
                    """
                    INSERT INTO line_groups (group_id, joined_at, left_at)
                    VALUES ($1, NOW(), NULL)
                    ON CONFLICT (group_id) DO UPDATE
                    SET joined_at = NOW(), left_at = NULL
                    """,
                    group_id,
                )
                print(f"[line_webhook] joined group={group_id}", flush=True)
            elif etype == "leave":
                await conn.execute(
                    "UPDATE line_groups SET left_at = NOW() WHERE group_id = $1",
                    group_id,
                )
                print(f"[line_webhook] left group={group_id}", flush=True)
    return {"ok": True}


# ── LINE group management ─────────────────────────────────────

class LineGroupLabelPayload(BaseModel):
    label: str = ""


@app.get("/api/line-groups")
async def list_line_groups():
    if _db_pool is None:
        return {"data": []}
    async with _db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT group_id, label, joined_at, left_at
            FROM line_groups
            ORDER BY joined_at DESC
            """
        )
    return {
        "data": [
            {
                "group_id": r["group_id"],
                "label": r["label"],
                "joined_at": r["joined_at"].isoformat() if r["joined_at"] else None,
                "left_at": r["left_at"].isoformat() if r["left_at"] else None,
            }
            for r in rows
        ]
    }


@app.post("/api/line-groups/{group_id}")
async def set_line_group_label(group_id: str, payload: LineGroupLabelPayload):
    pool = _require_db()
    label = (payload.label or "").strip()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE line_groups SET label = $1 WHERE group_id = $2",
            label,
            group_id,
        )
        if result.endswith("0"):
            raise HTTPException(status_code=404, detail="Group not found")
    return {"ok": True, "group_id": group_id, "label": label}


# ── LINE push configs CRUD ────────────────────────────────────

class LinePushConfigPayload(BaseModel):
    id: Optional[str] = None
    campaign_id: str
    account_id: str
    group_id: str
    frequency: str
    weekdays: List[int] = []
    month_day: Optional[int] = None
    hour: int
    minute: int
    date_range: str = "last_7d"
    enabled: bool = True


def _config_row_to_dict(r: asyncpg.Record) -> dict:
    return {
        "id": str(r["id"]),
        "campaign_id": r["campaign_id"],
        "account_id": r["account_id"],
        "group_id": r["group_id"],
        "frequency": r["frequency"],
        "weekdays": list(r["weekdays"] or []),
        "month_day": r["month_day"],
        "hour": r["hour"],
        "minute": r["minute"],
        "date_range": r["date_range"],
        "enabled": r["enabled"],
        "last_run_at": r["last_run_at"].isoformat() if r["last_run_at"] else None,
        "next_run_at": r["next_run_at"].isoformat() if r["next_run_at"] else None,
        "last_error": r["last_error"],
        "fail_count": r["fail_count"],
    }


def _validate_push_payload(p: LinePushConfigPayload) -> None:
    if p.frequency not in _VALID_FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid frequency")
    if p.date_range not in _VALID_DATE_RANGES:
        raise HTTPException(status_code=400, detail="Invalid date_range")
    if not 0 <= p.hour <= 23:
        raise HTTPException(status_code=400, detail="Invalid hour")
    if not 0 <= p.minute <= 59:
        raise HTTPException(status_code=400, detail="Invalid minute")
    if p.frequency == FREQUENCY_WEEKLY:
        if not p.weekdays:
            raise HTTPException(status_code=400, detail="weekdays required for weekly")
        if any(w < 0 or w > 6 for w in p.weekdays):
            raise HTTPException(status_code=400, detail="Invalid weekday")
    if p.frequency == FREQUENCY_MONTHLY:
        if p.month_day is None or p.month_day < 1 or p.month_day > 28:
            raise HTTPException(status_code=400, detail="month_day must be 1..28")


@app.get("/api/line-push/configs")
async def list_push_configs(campaign_id: Optional[str] = None):
    if _db_pool is None:
        return {"data": []}
    async with _db_pool.acquire() as conn:
        if campaign_id:
            rows = await conn.fetch(
                """
                SELECT * FROM campaign_line_push_configs
                WHERE campaign_id = $1
                ORDER BY created_at ASC
                """,
                campaign_id,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM campaign_line_push_configs ORDER BY created_at ASC"
            )
    return {"data": [_config_row_to_dict(r) for r in rows]}


@app.post("/api/line-push/configs")
async def upsert_push_config(payload: LinePushConfigPayload):
    pool = _require_db()
    _validate_push_payload(payload)
    next_run = _compute_next_run(
        payload.frequency,
        payload.weekdays,
        payload.month_day,
        payload.hour,
        payload.minute,
    )
    async with pool.acquire() as conn:
        # Verify the target group actually exists — otherwise the FK
        # error would surface as a generic 500.
        grp = await conn.fetchrow(
            "SELECT group_id FROM line_groups WHERE group_id = $1",
            payload.group_id,
        )
        if grp is None:
            raise HTTPException(status_code=404, detail="LINE group not found")
        if payload.id:
            row = await conn.fetchrow(
                """
                UPDATE campaign_line_push_configs
                SET campaign_id = $1, account_id = $2, group_id = $3,
                    frequency = $4, weekdays = $5, month_day = $6,
                    hour = $7, minute = $8, date_range = $9, enabled = $10,
                    next_run_at = $11, fail_count = 0, last_error = NULL,
                    updated_at = NOW()
                WHERE id = $12::uuid
                RETURNING *
                """,
                payload.campaign_id,
                payload.account_id,
                payload.group_id,
                payload.frequency,
                payload.weekdays,
                payload.month_day,
                payload.hour,
                payload.minute,
                payload.date_range,
                payload.enabled,
                next_run,
                payload.id,
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Config not found")
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO campaign_line_push_configs (
                    campaign_id, account_id, group_id,
                    frequency, weekdays, month_day, hour, minute,
                    date_range, enabled, next_run_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (campaign_id, group_id) DO UPDATE
                SET frequency = EXCLUDED.frequency,
                    weekdays = EXCLUDED.weekdays,
                    month_day = EXCLUDED.month_day,
                    hour = EXCLUDED.hour,
                    minute = EXCLUDED.minute,
                    date_range = EXCLUDED.date_range,
                    enabled = EXCLUDED.enabled,
                    next_run_at = EXCLUDED.next_run_at,
                    fail_count = 0,
                    last_error = NULL,
                    updated_at = NOW()
                RETURNING *
                """,
                payload.campaign_id,
                payload.account_id,
                payload.group_id,
                payload.frequency,
                payload.weekdays,
                payload.month_day,
                payload.hour,
                payload.minute,
                payload.date_range,
                payload.enabled,
                next_run,
            )
    return {"ok": True, "data": _config_row_to_dict(row)}


@app.delete("/api/line-push/configs/{config_id}")
async def delete_push_config(config_id: str):
    pool = _require_db()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM campaign_line_push_configs WHERE id = $1::uuid",
            config_id,
        )
    return {"ok": True}


@app.post("/api/line-push/configs/{config_id}/test")
async def test_push_config(config_id: str):
    """Fire a push immediately without advancing next_run_at.

    Handy for validating a newly-saved config or a fresh group label.
    """
    pool = _require_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM campaign_line_push_configs WHERE id = $1::uuid",
            config_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Config not found")
    cfg = _config_row_to_dict(row)
    try:
        flex = await _build_flex_for_config(cfg)
        assert _http_client is not None
        await line_client.line_push(_http_client, cfg["group_id"], [flex])
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO line_push_logs (config_id, success, message_preview)
                VALUES ($1::uuid, TRUE, $2)
                """,
                config_id,
                (flex.get("altText") or "")[:200],
            )
        return {"ok": True}
    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO line_push_logs (config_id, success, error)
                VALUES ($1::uuid, FALSE, $2)
                """,
                config_id,
                str(e)[:500],
            )
        raise HTTPException(status_code=502, detail=f"LINE push failed: {e}")


@app.get("/api/line-push/logs")
async def list_push_logs(config_id: Optional[str] = None, limit: int = 20):
    if _db_pool is None:
        return {"data": []}
    limit = max(1, min(limit, 100))
    async with _db_pool.acquire() as conn:
        if config_id:
            rows = await conn.fetch(
                """
                SELECT id, config_id, run_at, success, error, message_preview
                FROM line_push_logs
                WHERE config_id = $1::uuid
                ORDER BY run_at DESC
                LIMIT $2
                """,
                config_id,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, config_id, run_at, success, error, message_preview
                FROM line_push_logs
                ORDER BY run_at DESC
                LIMIT $1
                """,
                limit,
            )
    return {
        "data": [
            {
                "id": r["id"],
                "config_id": str(r["config_id"]) if r["config_id"] else None,
                "run_at": r["run_at"].isoformat() if r["run_at"] else None,
                "success": r["success"],
                "error": r["error"],
                "message_preview": r["message_preview"],
            }
            for r in rows
        ]
    }


# ── Scheduler loop ────────────────────────────────────────────

async def _scheduler_tick() -> None:
    """Run one pass: find due configs, push each, update bookkeeping."""
    if _db_pool is None:
        return
    now = datetime.now(timezone.utc)
    async with _db_pool.acquire() as conn:
        due = await conn.fetch(
            """
            SELECT * FROM campaign_line_push_configs
            WHERE enabled
              AND next_run_at <= $1
              AND (last_run_at IS NULL OR last_run_at < next_run_at)
            ORDER BY next_run_at ASC
            LIMIT 50
            """,
            now,
        )

    for row in due:
        cfg = _config_row_to_dict(row)
        try:
            flex = await _build_flex_for_config(cfg)
            assert _http_client is not None
            await line_client.line_push(_http_client, cfg["group_id"], [flex])
            next_run = _compute_next_run(
                cfg["frequency"],
                cfg["weekdays"],
                cfg["month_day"],
                cfg["hour"],
                cfg["minute"],
            )
            async with _db_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE campaign_line_push_configs
                    SET last_run_at = $1, next_run_at = $2,
                        fail_count = 0, last_error = NULL, updated_at = NOW()
                    WHERE id = $3::uuid
                    """,
                    now,
                    next_run,
                    cfg["id"],
                )
                await conn.execute(
                    """
                    INSERT INTO line_push_logs (config_id, success, message_preview)
                    VALUES ($1::uuid, TRUE, $2)
                    """,
                    cfg["id"],
                    (flex.get("altText") or "")[:200],
                )
            print(
                f"[scheduler] pushed cfg={cfg['id']} group={cfg['group_id']}",
                flush=True,
            )
        except Exception as e:
            fail_count = int(cfg.get("fail_count") or 0) + 1
            auto_disable = fail_count >= SCHEDULER_FAIL_THRESHOLD
            async with _db_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE campaign_line_push_configs
                    SET fail_count = $1, last_error = $2,
                        enabled = CASE WHEN $3 THEN FALSE ELSE enabled END,
                        updated_at = NOW()
                    WHERE id = $4::uuid
                    """,
                    fail_count,
                    str(e)[:500],
                    auto_disable,
                    cfg["id"],
                )
                await conn.execute(
                    """
                    INSERT INTO line_push_logs (config_id, success, error)
                    VALUES ($1::uuid, FALSE, $2)
                    """,
                    cfg["id"],
                    str(e)[:500],
                )
            print(
                f"[scheduler] push FAILED cfg={cfg['id']} err={e}"
                f"{' (auto-disabled)' if auto_disable else ''}",
                flush=True,
            )


async def _scheduler_loop() -> None:
    """Long-running task — one tick every SCHEDULER_TICK_SECONDS.

    Any exception inside the tick is caught and logged so the loop
    itself never dies. CancelledError from shutdown propagates out.
    """
    try:
        while True:
            try:
                await _scheduler_tick()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[scheduler] tick error: {e}", flush=True)
            await asyncio.sleep(SCHEDULER_TICK_SECONDS)
    except asyncio.CancelledError:
        print("[scheduler] stopped", flush=True)
        raise


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

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        r = await _http_client.post(
            url, json=payload,
            headers={"x-goog-api-key": GEMINI_API_KEY},
            timeout=_POST_TIMEOUT,
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Gemini API timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Gemini API: {e}")

    try:
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON (HTTP {r.status_code})")

    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "Gemini error"))

    candidates = data.get("candidates") or []
    if not candidates:
        raise HTTPException(status_code=502, detail="Gemini returned no candidates")
    text = (
        candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if isinstance(candidates[0], dict) else ""
    )
    if not text:
        raise HTTPException(status_code=502, detail="Gemini returned empty response")
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
