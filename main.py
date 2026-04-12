from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional, List
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

# Serve static files (PWA manifest, service worker, icons)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Helpers ─────────────────────────────────────────────────────────

async def fb_get(path: str, params: Optional[dict] = None) -> dict:
    if params is None:
        params = {}
    params = {"access_token": get_token(), **params}
    r = await _http_client.get(f"{BASE_URL}/{path}", params=params)
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
    return data


async def fb_post(path: str, payload: Optional[dict] = None) -> dict:
    if payload is None:
        payload = {}
    payload = {"access_token": get_token(), **payload}
    r = await _http_client.post(f"{BASE_URL}/{path}", data=payload)
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
    return data


def _insights_clause(fields: str, date_preset: str = "last_30d", time_range: Optional[str] = None) -> str:
    """Build FB insights sub-field with correct date parameter."""
    if time_range:
        return f"insights.time_range({time_range}){{{fields}}}"
    return f"insights.date_preset({date_preset}){{{fields}}}"


# ── Pages ───────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    return DASHBOARD_HTML.read_text(encoding="utf-8")


@app.get("/sw.js")
async def service_worker():
    """Serve service worker from root scope."""
    sw_path = STATIC_DIR / "sw.js"
    if sw_path.exists():
        return HTMLResponse(content=sw_path.read_text(encoding="utf-8"), media_type="application/javascript")
    return HTMLResponse(content="// no service worker", media_type="application/javascript")


@app.get("/manifest.json")
async def manifest():
    """Serve PWA manifest from root."""
    mf_path = STATIC_DIR / "manifest.json"
    if mf_path.exists():
        return HTMLResponse(content=mf_path.read_text(encoding="utf-8"), media_type="application/manifest+json")
    return JSONResponse(content={})


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
    return await fb_post(f"{payload.account_id}/campaigns", {
        "name": payload.name,
        "objective": payload.objective,
        "status": payload.status,
        "special_ad_categories": "[]",
        "daily_budget": str(payload.daily_budget),
    })


# ── 廣告帳戶 ─────────────────────────────────────────────────────────

@app.get("/api/accounts")
async def get_accounts():
    accounts = []
    next_url = f"{BASE_URL}/me/adaccounts"
    params = {
        "fields": "id,name,account_status,currency,timezone_name,business",
        "access_token": get_token(),
        "limit": "100"
    }
    while next_url:
        r = await _http_client.get(next_url, params=params)
        data = r.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
        accounts.extend(data.get("data", []))
        next_url = data.get("paging", {}).get("next")
        params = {}  # next_url already contains all params
    return {"data": accounts}


# ── 行銷活動 ─────────────────────────────────────────────────────────

@app.get("/api/accounts/{account_id}/campaigns")
async def get_campaigns(account_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None):
    ins = _insights_clause("spend,impressions,clicks,ctr,cpc,cpm,frequency,reach,actions", date_preset, time_range)
    try:
        data = await fb_get(f"{account_id}/campaigns", {
            "fields": f"id,name,status,objective,daily_budget,lifetime_budget,{ins}",
            "limit": "100"
        })
    except Exception:
        data = await fb_get(f"{account_id}/campaigns", {
            "fields": "id,name,status,objective,daily_budget,lifetime_budget",
            "limit": "100"
        })
    return data


@app.post("/api/campaigns/{campaign_id}/status")
async def update_campaign_status(campaign_id: str, status: str = Query(...)):
    return await fb_post(campaign_id, {"status": status})


@app.post("/api/campaigns/{campaign_id}/budget")
async def update_campaign_budget(campaign_id: str, daily_budget: int = Query(None), lifetime_budget: int = Query(None)):
    payload = {}
    if daily_budget:
        payload["daily_budget"] = str(daily_budget)
    if lifetime_budget:
        payload["lifetime_budget"] = str(lifetime_budget)
    return await fb_post(campaign_id, payload)


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
    return await fb_post(adset_id, {"status": status})


@app.post("/api/adsets/{adset_id}/budget")
async def update_adset_budget(adset_id: str, daily_budget: int = Query(None)):
    payload = {}
    if daily_budget:
        payload["daily_budget"] = str(daily_budget)
    return await fb_post(adset_id, payload)


# ── 廣告 ─────────────────────────────────────────────────────────────

@app.get("/api/adsets/{adset_id}/ads")
async def get_ads(adset_id: str, date_preset: str = "last_30d", time_range: Optional[str] = None):
    ins = _insights_clause("spend,impressions,clicks,ctr,cpc,cpm,actions", date_preset, time_range)
    try:
        data = await fb_get(f"{adset_id}/ads", {
            "fields": f"id,name,status,creative{{thumbnail_url,title,body}},{ins}",
            "limit": "100"
        })
    except Exception:
        # Fallback: query without creative sub-fields if it fails
        data = await fb_get(f"{adset_id}/ads", {
            "fields": f"id,name,status,{ins}",
            "limit": "100"
        })
    return data


@app.post("/api/ads/{ad_id}/status")
async def update_ad_status(ad_id: str, status: str = Query(...)):
    return await fb_post(ad_id, {"status": status})


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
