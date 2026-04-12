from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional
import httpx
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

APP_ID = os.getenv("FB_APP_ID")
APP_SECRET = os.getenv("FB_APP_SECRET")
_ACCESS_TOKEN = os.getenv("FB_ACCESS_TOKEN")
API_VERSION = os.getenv("FB_API_VERSION", "v21.0")
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# Runtime token override (from FB Login)
_runtime_token: Optional[str] = None

def get_token() -> str:
    return _runtime_token or _ACCESS_TOKEN or ""

DASHBOARD_HTML = Path(__file__).parent / "dashboard.html"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="FB Ads Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def fb_get(path: str, params: dict = {}) -> dict:
    params = {"access_token": get_token(), **params}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE_URL}/{path}", params=params)
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
    return data


async def fb_post(path: str, payload: dict = {}) -> dict:
    payload["access_token"] = get_token()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{BASE_URL}/{path}", data=payload)
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
    return data


@app.get("/", response_class=HTMLResponse)
async def root():
    return DASHBOARD_HTML.read_text(encoding="utf-8")


# ── Auth ─────────────────────────────────────────────────────────────
from pydantic import BaseModel

class TokenPayload(BaseModel):
    token: str

@app.post("/api/auth/token")
async def set_token(payload: TokenPayload):
    global _runtime_token
    _runtime_token = payload.token
    # Verify token
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
        me = await fb_get("me", {"fields": "id,name,picture"})
        return {"logged_in": True, **me}
    except:
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
    """快速建立行銷活動"""
    return await fb_post(f"{payload.account_id}/campaigns", {
        "name": payload.name,
        "objective": payload.objective,
        "status": payload.status,
        "special_ad_categories": "[]",
        "daily_budget": str(payload.daily_budget * 100),
    })


# ── 廣告帳戶 ─────────────────────────────────────────────────────────
@app.get("/api/accounts")
async def get_accounts():
    """取得所有廣告帳戶"""
    accounts = []
    next_url = f"{BASE_URL}/me/adaccounts"
    params = {
        "fields": "id,name,account_status,currency,timezone_name",
        "access_token": get_token(),
        "limit": "100"
    }
    async with httpx.AsyncClient(timeout=30) as client:
        while next_url:
            r = await client.get(next_url, params=params)
            data = r.json()
            if "error" in data:
                raise HTTPException(status_code=400, detail=data["error"].get("message", "FB API Error"))
            accounts.extend(data.get("data", []))
            next_url = data.get("paging", {}).get("next")
            params = {}  # next_url already contains all params
    return {"data": accounts}


# ── 行銷活動 ─────────────────────────────────────────────────────────
@app.get("/api/accounts/{account_id}/campaigns")
async def get_campaigns(account_id: str, date_preset: str = "last_30d"):
    data = await fb_get(f"{account_id}/campaigns", {
        "fields": "id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(" + date_preset + "){spend,impressions,clicks,ctr,cpc,cpm,actions}",
        "limit": "100"
    })
    return data


@app.post("/api/campaigns/{campaign_id}/status")
async def update_campaign_status(campaign_id: str, status: str = Query(...)):
    """開啟/暫停行銷活動 status: ACTIVE | PAUSED"""
    return await fb_post(campaign_id, {"status": status})


@app.post("/api/campaigns/{campaign_id}/budget")
async def update_campaign_budget(campaign_id: str, daily_budget: int = Query(None), lifetime_budget: int = Query(None)):
    payload = {}
    if daily_budget:
        payload["daily_budget"] = str(daily_budget * 100)  # cents
    if lifetime_budget:
        payload["lifetime_budget"] = str(lifetime_budget * 100)
    return await fb_post(campaign_id, payload)


# ── 廣告組合 ─────────────────────────────────────────────────────────
@app.get("/api/campaigns/{campaign_id}/adsets")
async def get_adsets(campaign_id: str, date_preset: str = "last_30d"):
    data = await fb_get(f"{campaign_id}/adsets", {
        "fields": "id,name,status,daily_budget,lifetime_budget,insights.date_preset(" + date_preset + "){spend,impressions,clicks,ctr,cpc,cpm}",
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
        payload["daily_budget"] = str(daily_budget * 100)
    return await fb_post(adset_id, payload)


# ── 廣告 ─────────────────────────────────────────────────────────────
@app.get("/api/adsets/{adset_id}/ads")
async def get_ads(adset_id: str, date_preset: str = "last_30d"):
    data = await fb_get(f"{adset_id}/ads", {
        "fields": "id,name,status,creative{thumbnail_url,title,body},insights.date_preset(" + date_preset + "){spend,impressions,clicks,ctr,cpc,cpm}",
        "limit": "100"
    })
    return data


@app.post("/api/ads/{ad_id}/status")
async def update_ad_status(ad_id: str, status: str = Query(...)):
    return await fb_post(ad_id, {"status": status})


# ── 帳戶整體成效 ──────────────────────────────────────────────────────
@app.get("/api/accounts/{account_id}/insights")
async def get_account_insights(account_id: str, date_preset: str = "last_30d"):
    data = await fb_get(f"{account_id}/insights", {
        "fields": "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions",
        "date_preset": date_preset,
    })
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
