"""LINE Messaging API helper.

Thin wrapper around the `push` endpoint plus a webhook-signature
verifier. Kept deliberately small — all heavy lifting (scheduling,
persistence, report building) lives in main.py. This module only
knows how to shove a pre-built payload into LINE's HTTP API.

Mock mode (``LINE_MOCK=1``) prints payloads to stdout instead of
calling the real API, so the full scheduler → push pipeline can be
exercised locally without a channel token.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from typing import Any, List, Optional

import httpx

LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"


def _access_token() -> str:
    return os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "") or ""


def _channel_secret() -> str:
    return os.getenv("LINE_CHANNEL_SECRET", "") or ""


def _mock_enabled() -> bool:
    return os.getenv("LINE_MOCK", "0") == "1"


class LinePushError(RuntimeError):
    """Raised when LINE returns a non-2xx response."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"LINE push failed: {status} {detail}")
        self.status = status
        self.detail = detail


async def line_push(
    client: httpx.AsyncClient,
    group_id: str,
    messages: List[dict],
) -> None:
    """Push `messages` (1-5 Message objects) to a LINE group.

    `client` is the shared `_http_client` owned by main.py's lifespan
    so we reuse connection pooling and timeouts.
    """
    if _mock_enabled():
        preview = json.dumps(messages, ensure_ascii=False)[:400]
        print(f"[line_push] mock group={group_id} msgs={preview}", flush=True)
        return

    token = _access_token()
    if not token:
        raise LinePushError(0, "LINE_CHANNEL_ACCESS_TOKEN not set")

    resp = await client.post(
        LINE_PUSH_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"to": group_id, "messages": messages},
        timeout=15,
    )
    if resp.status_code >= 300:
        # LINE returns JSON {"message": "...", "details": [...]}
        try:
            body = resp.json()
            detail = body.get("message") or json.dumps(body)
        except Exception:
            detail = resp.text[:400]
        raise LinePushError(resp.status_code, detail)


def verify_webhook_signature(body: bytes, signature: Optional[str]) -> bool:
    """Verify `X-Line-Signature` header against the raw request body.

    LINE docs: sign = base64(hmac-sha256(channelSecret, body)). A
    missing secret OR header is treated as invalid.
    """
    secret = _channel_secret()
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    # Constant-time compare to avoid timing leaks.
    return hmac.compare_digest(expected, signature)


def build_flex_report(
    campaign_name: str,
    account_name: str,
    date_label: str,
    kpis: list[tuple[str, str]],
    *,
    alt_text: Optional[str] = None,
) -> dict:
    """Build a LINE Flex Message bubble for a campaign report.

    `kpis` is a list of (label, value) tuples, rendered as a grid of
    rows in the body. Colours match the dashboard's orange branding
    (#FF6B2C) so the message feels consistent with the web UI.
    """
    alt = alt_text or f"{campaign_name} 報告（{date_label}）"

    kpi_rows: list[dict[str, Any]] = []
    for label, value in kpis:
        kpi_rows.append(
            {
                "type": "box",
                "layout": "horizontal",
                "contents": [
                    {
                        "type": "text",
                        "text": label,
                        "size": "sm",
                        "color": "#888888",
                        "flex": 3,
                    },
                    {
                        "type": "text",
                        "text": value,
                        "size": "sm",
                        "color": "#1A1A1A",
                        "weight": "bold",
                        "align": "end",
                        "flex": 4,
                        "wrap": True,
                    },
                ],
                "margin": "sm",
            }
        )

    bubble: dict[str, Any] = {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#FF6B2C",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": "LURE META · 行銷活動報告",
                    "size": "xs",
                    "color": "#FFE8D9",
                    "weight": "bold",
                },
                {
                    "type": "text",
                    "text": campaign_name,
                    "size": "lg",
                    "color": "#FFFFFF",
                    "weight": "bold",
                    "wrap": True,
                    "margin": "sm",
                },
                {
                    "type": "text",
                    "text": account_name,
                    "size": "xs",
                    "color": "#FFE8D9",
                    "margin": "xs",
                    "wrap": True,
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": f"資料區間：{date_label}",
                    "size": "xs",
                    "color": "#888888",
                },
                {"type": "separator", "margin": "md", "color": "#F0F0F0"},
                *kpi_rows,
            ],
        },
    }

    return {"type": "flex", "altText": alt[:400], "contents": bubble}
