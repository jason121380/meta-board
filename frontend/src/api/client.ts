import type { DateConfig } from "@/lib/datePicker";
import { toApiParams } from "@/lib/datePicker";

/**
 * Typed-ish API client for the FastAPI backend.
 *
 * Intentionally hand-written rather than codegen'd (for now) — the
 * API surface is small (24 endpoints) and we want the error shape
 * exactly aligned with the `{detail: "..."}` convention the backend
 * uses. Phase 2+ will swap this out for openapi-fetch + openapi-typescript
 * codegen once the backend is running in CI.
 *
 * Error contract: every failed call throws an `ApiError` with
 * `.status` (HTTP status code) and `.detail` (string message) so
 * callers / TanStack Query `onError` can display a meaningful message.
 */

import type {
  FbAccount,
  FbAdset,
  FbBaseEntity,
  FbCampaign,
  FbCreativeEntity,
  FbInsights,
} from "@/types/fb";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: { body?: unknown; query?: Record<string, string | undefined> },
): Promise<T> {
  let url = path;
  if (options?.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) params.append(key, value);
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : "Network error";
    throw new ApiError(0, msg);
  }

  // Try to parse the body as JSON — backend always returns JSON errors
  // after commit 3bf1e35 (silent-500 fix).
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON body, keep null */
  }

  if (!response.ok) {
    const detail = extractDetail(body) || `HTTP ${response.status}`;
    throw new ApiError(response.status, detail);
  }

  return body as T;
}

function extractDetail(body: unknown): string | null {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.error === "string") return obj.error;
    if (obj.error && typeof obj.error === "object") {
      const err = obj.error as Record<string, unknown>;
      if (typeof err.message === "string") return err.message;
    }
  }
  return null;
}

/** Build the query suffix used by the tree / insights endpoints. */
function dateParams(date: DateConfig): Record<string, string | undefined> {
  const [key, value] = toApiParams(date).split("=") as [string, string];
  return { [key]: value };
}

// ── Auth ─────────────────────────────────────────────
export interface AuthMeResponse {
  logged_in: boolean;
  id?: string;
  name?: string;
  picture?: { data: { url: string } };
}

export const api = {
  auth: {
    setToken: (token: string) =>
      request<{ ok: boolean; name?: string; id?: string }>("POST", "/api/auth/token", {
        body: { token },
      }),
    clearToken: () => request<{ ok: boolean }>("DELETE", "/api/auth/token"),
    me: () => request<AuthMeResponse>("GET", "/api/auth/me"),
  },

  accounts: {
    list: () => request<{ data: FbAccount[] }>("GET", "/api/accounts"),
    insights: (accountId: string, date: DateConfig) =>
      request<{ data: FbInsights[] }>("GET", `/api/accounts/${accountId}/insights`, {
        query: dateParams(date),
      }),
    campaigns: (accountId: string, date: DateConfig, includeArchived = false) =>
      request<{ data: FbCampaign[] }>("GET", `/api/accounts/${accountId}/campaigns`, {
        query: { ...dateParams(date), include_archived: includeArchived ? "true" : undefined },
      }),
    /** Flat list of every ad in the account, with creative + insights
     * + parent campaign/adset names. Used by the Creative Center. */
    ads: (accountId: string, date: DateConfig) =>
      request<{ data: FbCreativeEntity[] }>("GET", `/api/accounts/${accountId}/ads`, {
        query: dateParams(date),
      }),
  },

  campaigns: {
    adsets: (campaignId: string, date: DateConfig) =>
      request<{ data: FbAdset[] }>("GET", `/api/campaigns/${campaignId}/adsets`, {
        query: dateParams(date),
      }),
    setStatus: (campaignId: string, status: string) =>
      request<FbBaseEntity>("POST", `/api/campaigns/${campaignId}/status`, {
        query: { status },
      }),
    setBudget: (campaignId: string, dailyBudget: number) =>
      request<FbBaseEntity>("POST", `/api/campaigns/${campaignId}/budget`, {
        query: { daily_budget: String(dailyBudget) },
      }),
  },

  adsets: {
    creatives: (adsetId: string, date: DateConfig) =>
      request<{ data: FbCreativeEntity[] }>("GET", `/api/adsets/${adsetId}/ads`, {
        query: dateParams(date),
      }),
    setStatus: (adsetId: string, status: string) =>
      request<FbBaseEntity>("POST", `/api/adsets/${adsetId}/status`, {
        query: { status },
      }),
    setBudget: (adsetId: string, dailyBudget: number) =>
      request<FbBaseEntity>("POST", `/api/adsets/${adsetId}/budget`, {
        query: { daily_budget: String(dailyBudget) },
      }),
  },

  creatives: {
    setStatus: (creativeId: string, status: string) =>
      request<FbBaseEntity>("POST", `/api/ads/${creativeId}/status`, {
        query: { status },
      }),
  },

  videos: {
    /** Resolve a FB video asset id to its playable source URL and
     * poster frame. Only called lazily when a preview modal opens. */
    source: (videoId: string) =>
      request<{ source?: string; picture?: string }>(
        "GET",
        `/api/videos/${videoId}/source`,
      ),
  },

  launch: {
    campaign: (payload: {
      account_id: string;
      name: string;
      objective: string;
      daily_budget: number;
      status: string;
    }) => request<{ id: string }>("POST", "/api/quick-launch/campaign", { body: payload }),
  },

  settings: {
    get: (userId: string) =>
      request<{ settings: Record<string, unknown> | null }>("GET", `/api/settings/${userId}`),
    save: (userId: string, payload: Record<string, unknown>) =>
      request<{ ok: boolean }>("POST", `/api/settings/${userId}`, { body: payload }),
  },

  ai: {
    chat: (messages: Array<{ role: "user" | "model"; text: string }>, context?: string) =>
      request<{ reply: string }>("POST", "/api/ai/chat", {
        body: { messages, context },
      }),
  },
};

export type Api = typeof api;
