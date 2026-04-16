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

// ── 401 auto-refresh ──────────────────────────────────────────
//
// When the backend process restarts (e.g. Zeabur redeploy) its
// in-memory `_runtime_token` is reset to None. Any in-flight React
// Query on an open tab will then start returning
// "Facebook access token not set. Please log in." 401s until the
// user manually re-logs in or refreshes the page.
//
// Rather than leave the app in a broken state, the request helper
// catches the first 401 per call, asks the already-loaded FB JS
// SDK for a fresh access token (synchronous from the user's point
// of view — the browser still has the FB cookie), re-pushes it to
// the backend via `/api/auth/token`, and retries the original
// request once. The user sees at most a ~1s blip.
//
// The retry is gated on `skipAuthRefresh` so the token-exchange
// call itself never recurses. `isRefreshing` + the shared promise
// de-dupe concurrent 401s so N parallel queries only kick off ONE
// refresh, not N.

let refreshPromise: Promise<void> | null = null;

function refreshBackendToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = new Promise<void>((resolve, reject) => {
    const FB = (
      window as unknown as {
        FB?: {
          getLoginStatus: (
            cb: (r: { status: string; authResponse?: { accessToken: string } }) => void,
          ) => void;
        };
      }
    ).FB;
    if (!FB) {
      reject(new Error("FB SDK not loaded"));
      return;
    }
    FB.getLoginStatus((resp) => {
      const accessToken = resp.authResponse?.accessToken;
      if (resp.status === "connected" && accessToken) {
        request<{ ok: boolean }>("POST", "/api/auth/token", {
          body: { token: accessToken },
          skipAuthRefresh: true,
        })
          .then(() => resolve())
          .catch(reject);
      } else {
        reject(new Error("FB session not connected"));
      }
    });
  });
  // Clear the shared promise after it settles so subsequent 401s
  // can trigger another refresh if needed.
  refreshPromise.finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string | undefined>;
    /** Internal flag — set by the 401 retry path so the token
     * refresh call itself doesn't loop back through this logic. */
    skipAuthRefresh?: boolean;
  },
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
    // Self-healing auth: if the backend lost the runtime token (e.g.
    // the process was just restarted), push the FB SDK's access
    // token back up and retry once. skipAuthRefresh prevents the
    // token-push call itself from re-entering this branch.
    if (response.status === 401 && !options?.skipAuthRefresh) {
      try {
        await refreshBackendToken();
        return request<T>(method, path, { ...options, skipAuthRefresh: true });
      } catch {
        /* fall through to throw the original 401 */
      }
    }
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
    /** Request a larger-dimension server-rendered thumbnail for a
     * single AdCreative. Used as a graceful fallback for the preview
     * modal when the post-media path fails (typically due to missing
     * pages_read_engagement on the user token). Typical size: 600px. */
    hiresThumbnail: (creativeId: string, size = 600) =>
      request<{ thumbnail_url: string | null; error: string | null }>(
        "GET",
        `/api/creatives/${creativeId}/hires-thumbnail`,
        { query: { size: String(size) } },
      ),
  },

  videos: {
    /** Resolve a FB video asset id to its playable source URL and
     * poster frame. Only called lazily when a preview modal opens. */
    source: (videoId: string) =>
      request<{ source?: string; picture?: string }>("GET", `/api/videos/${videoId}/source`),
  },

  pages: {
    /** Fetch a FB Page's display name + profile picture URL. Used
     * by the creative preview modal to render a FB-post-style header
     * row. Only called lazily when a preview modal opens.
     *
     * The backend returns ``error`` (not null on failure) so the
     * frontend can surface e.g. "insufficient permissions" instead
     * of silently showing a blank Page name. */
    info: (pageId: string) =>
      request<{
        name: string | null;
        picture_url: string | null;
        error: string | null;
      }>("GET", `/api/pages/${pageId}/info`),
  },

  posts: {
    /** Fetch the full-resolution image / video source from a FB page
     * post. Used by the creative preview modal for "front-stage" ads
     * that reuse an existing organic post — in that case the creative
     * endpoint only returns a blurry thumbnail and no video handle.
     *
     * The backend returns ``error`` (non-null when the fetch fails,
     * e.g. missing pages_read_engagement) so the frontend can fall
     * back to the hires thumbnail path and, ultimately, to a blurred
     * thumbnail with a "view original" call-to-action. */
    media: (postId: string) =>
      request<{
        image_url: string | null;
        video_source: string | null;
        error: string | null;
      }>("GET", `/api/posts/${postId}/media`),
  },

  overview: {
    /** Batch fetch campaigns + insights for N accounts in a single
     * backend request. Bypasses the browser's 6-connection-per-origin
     * HTTP/1.1 limit that was the real bottleneck on Analytics /
     * Alerts / Finance first-load. */
    batch: (
      accountIds: string[],
      date: DateConfig,
      opts?: { includeArchived?: boolean; lite?: boolean },
    ) =>
      request<{
        data: Record<
          string,
          {
            campaigns: FbCampaign[];
            insights: FbInsights | null;
            error: string | null;
          }
        >;
      }>("GET", "/api/overview", {
        query: {
          ids: accountIds.join(","),
          ...dateParams(date),
          include_archived: opts?.includeArchived ? "true" : undefined,
          lite: opts?.lite ? "true" : undefined,
        },
      }),
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

  ai: {
    chat: (messages: Array<{ role: "user" | "model"; text: string }>, context?: string) =>
      request<{ reply: string }>("POST", "/api/ai/chat", {
        body: { messages, context },
      }),
  },
};

export type Api = typeof api;
