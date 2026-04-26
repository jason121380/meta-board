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
LINE_GROUP_SUMMARY_URL = "https://api.line.me/v2/bot/group/{group_id}/summary"


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


async def get_group_summary(
    client: httpx.AsyncClient,
    group_id: str,
) -> Optional[dict]:
    """Fetch a group's display name + picture URL from LINE.

    Returns ``{"groupId", "groupName", "pictureUrl"}`` on success,
    or ``None`` if the bot has no permission / group is gone / token
    is missing. Errors are logged but never raised — the caller
    treats a missing summary as "name unknown" and keeps going.
    """
    if _mock_enabled():
        return {"groupId": group_id, "groupName": f"Mock Group {group_id[:6]}", "pictureUrl": ""}

    token = _access_token()
    if not token:
        return None

    try:
        resp = await client.get(
            LINE_GROUP_SUMMARY_URL.format(group_id=group_id),
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.status_code >= 300:
            return None
        body = resp.json()
        if not isinstance(body, dict):
            return None
        return body
    except Exception:
        return None


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
    *,
    title: str,
    subtitle: str,
    kpis: list[tuple[str, str]],
    recommendations: Optional[List[str]] = None,
    report_url: Optional[str] = None,
    alt_text: Optional[str] = None,
) -> dict:
    """Build a LINE Flex Message bubble for a campaign report.

    Layout:
        Header (orange)
            {title}                 (campaign nickname or name)
            {subtitle}              (e.g. "報告區間: 4/1 - 4/25")

        Body (white)
            {kpi_rows}              (花費 / 曝光 / ... / 私訊成本)
            ─── separator ───       (only if recommendations is non-empty)
            AI 優化建議              (orange section title, only if any)
            • {bullet}              (one row per recommendation)

        Footer (white)              (only if report_url is provided)
            [ 查看完整報告 ]         (primary button → uri action)
    """
    alt = alt_text or f"{title}（{subtitle}）"

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

    suggestion_rows: list[dict[str, Any]] = []
    if recommendations:
        suggestion_rows.append(
            {"type": "separator", "margin": "lg", "color": "#F0F0F0"},
        )
        suggestion_rows.append(
            {
                "type": "text",
                "text": "AI 優化建議",
                "size": "sm",
                "color": "#FF6B2C",
                "weight": "bold",
                "margin": "lg",
            }
        )
        for rec in recommendations:
            suggestion_rows.append(
                {
                    "type": "box",
                    "layout": "horizontal",
                    "margin": "sm",
                    "contents": [
                        {
                            "type": "text",
                            "text": "•",
                            "size": "sm",
                            "color": "#FF6B2C",
                            "flex": 0,
                        },
                        {
                            "type": "text",
                            "text": rec,
                            "size": "sm",
                            "color": "#1A1A1A",
                            "wrap": True,
                            "margin": "sm",
                            "flex": 1,
                        },
                    ],
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
                    "text": title,
                    "size": "lg",
                    "color": "#FFFFFF",
                    "weight": "bold",
                    "wrap": True,
                },
                {
                    "type": "text",
                    "text": subtitle,
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
                *kpi_rows,
                *suggestion_rows,
            ],
        },
    }

    if report_url:
        bubble["footer"] = {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "paddingAll": "12px",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": "#FF6B2C",
                    "height": "sm",
                    "action": {
                        "type": "uri",
                        "label": "查看完整報告",
                        "uri": report_url,
                    },
                },
            ],
        }

    return {"type": "flex", "altText": alt[:400], "contents": bubble}
