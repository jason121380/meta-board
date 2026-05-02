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

// ── LINE push types (shared with hooks + modal) ───────────────
export type LinePushFrequency = "daily" | "weekly" | "biweekly" | "monthly";
export type LinePushDateRange =
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "month_to_yesterday"
  | "custom";

export interface LinePushConfig {
  id: string;
  campaign_id: string;
  account_id: string;
  group_id: string;
  frequency: LinePushFrequency;
  /** 0 = Sunday, 6 = Saturday. Used when frequency === "weekly". */
  weekdays: number[];
  /** 1..28. Used when frequency === "monthly". */
  month_day: number | null;
  hour: number;
  minute: number;
  date_range: LinePushDateRange;
  enabled: boolean;
  /** User-selected KPI field codes for the LINE flex report.
   *  Empty = use defaults. See REPORT_FIELDS for the catalog. */
  report_fields: string[];
  /** Show the「查看完整報告」footer button on the LINE flex card. */
  include_report_button: boolean;
  /** Render the「優化建議」bullet list in the flex body. */
  include_recommendations: boolean;
  /** Cached FB campaign name at save-time. Falls back to ID when empty. */
  campaign_name?: string;
  /** ISO YYYY-MM-DD; populated only when date_range === "custom". */
  date_from?: string | null;
  date_to?: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  fail_count: number;
  /** FB user id of the channel's owner. Frontend compares against the
   *  current user to decide whether edit/delete/test buttons are
   *  enabled — only the OA owner can mutate a config. */
  channel_owner_fb_user_id?: string | null;
  /** Display name of the channel pushing this config (informational). */
  channel_name?: string;
}

export interface LinePushConfigInput {
  id?: string;
  campaign_id: string;
  account_id: string;
  group_id: string;
  frequency: LinePushFrequency;
  weekdays?: number[];
  month_day?: number | null;
  hour: number;
  minute: number;
  date_range: LinePushDateRange;
  enabled: boolean;
  report_fields?: string[];
  include_report_button?: boolean;
  include_recommendations?: boolean;
  /** FB campaign name; cached on the row at save-time so the group
   *  management UI doesn't have to fall back to the bare campaign_id. */
  campaign_name?: string;
  /** ISO YYYY-MM-DD; required when date_range === "custom". */
  date_from?: string;
  date_to?: string;
}

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

/** Public share page (/r/...) is viewable without FB login — the
 *  backend uses its persisted runtime token. We must NOT try to
 *  refresh from the FB SDK here (it isn't loaded), and the raw
 *  backend "Please log in" message would be misleading to viewers
 *  who legitimately should not log in. */
function isSharePage(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/r/");
}

/** Default per-request timeout. The backend's longest path (overview
 *  batch over 80 accounts) tops out around ~12s end-to-end; 30s gives
 *  room for slow networks while still bounding hung tabs. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Compose two AbortSignals — fires when either aborts. Used to merge
 *  the per-call timeout with the caller's signal (typically supplied
 *  by react-query, which aborts on unmount / refetch). */
function composeSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const real = signals.filter((s): s is AbortSignal => Boolean(s));
  if (real.length === 0) return undefined;
  if (real.length === 1) return real[0];
  // AbortSignal.any() is widely supported in modern browsers; fall
  // back to a manual controller for older runtimes.
  if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(real);
  }
  const ctrl = new AbortController();
  for (const s of real) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string | undefined>;
    /** Internal flag — set by the 401 retry path so the token
     * refresh call itself doesn't loop back through this logic. */
    skipAuthRefresh?: boolean;
    /** Caller-supplied abort signal (typically from react-query's
     *  context — aborts on unmount / refetch). Composed with the
     *  default timeout signal. */
    signal?: AbortSignal;
    /** Override the default 30s timeout when needed. */
    timeoutMs?: number;
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

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(timeoutMs)
      : undefined;
  const signal = composeSignals(options?.signal, timeoutSignal);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
  } catch (networkErr) {
    if (
      networkErr instanceof DOMException &&
      (networkErr.name === "TimeoutError" || networkErr.name === "AbortError")
    ) {
      // Caller cancelled (unmount) → propagate so react-query treats it
      // as a cancellation, not an error.
      if (options?.signal?.aborted) throw networkErr;
      throw new ApiError(0, networkErr.name === "TimeoutError" ? "請求逾時" : "請求已取消");
    }
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
    // Share-page viewers can't log in — translate any 401 to a
    // friendlier message that doesn't say "請登入" to someone who
    // legitimately should not.
    if (response.status === 401 && isSharePage()) {
      throw new ApiError(401, "報告暫時無法載入,請聯繫管理員重新整理連結");
    }
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
      request<{ ok: boolean; name?: string; id?: string; pictureUrl?: string }>(
        "POST",
        "/api/auth/token",
        {
          body: { token },
        },
      ),
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

  breakdown: {
    /** Per-bucket insights for adset / ad, broken down by a single
     *  dimension (age / gender / region / publisher_platform). */
    list: (
      level: "adset" | "ad",
      id: string,
      dim: "age" | "gender" | "region" | "publisher_platform",
      date: DateConfig,
    ) =>
      request<{
        data: Array<{
          key: string;
          spend: string | number | null;
          impressions: string | number | null;
          clicks: string | number | null;
          ctr: string | number | null;
          cpc: string | number | null;
          cpm: string | number | null;
          msgs: number;
        }>;
        level: "adset" | "ad";
        dim: string;
      }>("GET", "/api/breakdown", {
        query: { level, id, dim, ...dateParams(date) },
      }),
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

  engineering: {
    /** Latest parsed `X-Business-Use-Case-Usage` snapshot from FB,
     * plus peak `estimated_time_to_regain_access` across all business
     * ids. Used by the Engineering (debug) view to show rate-limit
     * headroom per business and warn before we hit 100%. */
    fbUsage: () =>
      request<{
        data: Record<
          string,
          {
            call_count: number;
            total_cputime: number;
            total_time: number;
            estimated_time_to_regain_access: number;
            type: string;
            observed_at: number;
          }
        >;
        peak_regain_minutes: number;
      }>("GET", "/api/fb-usage"),
  },

  nicknames: {
    /** Fetch all campaign nicknames from the server. Returns an array
     * of `{campaign_id, store, designer}` rows. */
    list: () =>
      request<{
        data: Array<{ campaign_id: string; store: string; designer: string }>;
      }>("GET", "/api/nicknames"),
    /** Upsert a single campaign's nickname. Sending both fields empty
     * deletes the row server-side. */
    set: (campaignId: string, store: string, designer: string) =>
      request<{ ok: boolean }>("POST", `/api/nicknames/${encodeURIComponent(campaignId)}`, {
        body: { store, designer },
      }),
    remove: (campaignId: string) =>
      request<{ ok: boolean }>("DELETE", `/api/nicknames/${encodeURIComponent(campaignId)}`),
  },

  lineChannels: {
    /** List configured LINE Official Accounts visible to `fbUserId`.
     *  Returns secrets/tokens MASKED. The `editable` flag tells the
     *  UI whether this channel is owned by the calling user (per-user
     *  channel) vs shared / belonging to someone else. */
    list: (fbUserId: string) =>
      request<{
        data: Array<{
          id: string;
          name: string;
          channel_secret_masked: string;
          access_token_masked: string;
          enabled: boolean;
          is_default: boolean;
          is_orphan: boolean;
          editable: boolean;
          bound_groups_count: number;
          last_webhook_at: string | null;
          webhook_url: string;
          created_at: string | null;
          updated_at: string | null;
        }>;
      }>("GET", "/api/line-channels", { query: { fb_user_id: fbUserId } }),
    create: (
      fbUserId: string,
      body: {
        name: string;
        channel_secret: string;
        access_token: string;
        enabled: boolean;
        is_default: boolean;
      },
    ) =>
      request<{ ok: boolean; id: string }>("POST", "/api/line-channels", {
        body,
        query: { fb_user_id: fbUserId },
      }),
    update: (
      fbUserId: string,
      id: string,
      body: {
        name: string;
        channel_secret: string;
        access_token: string;
        enabled: boolean;
        is_default: boolean;
      },
    ) =>
      request<{ ok: boolean }>("PUT", `/api/line-channels/${encodeURIComponent(id)}`, {
        body,
        query: { fb_user_id: fbUserId },
      }),
    delete: (fbUserId: string, id: string) =>
      request<{ ok: boolean }>("DELETE", `/api/line-channels/${encodeURIComponent(id)}`, {
        query: { fb_user_id: fbUserId },
      }),
    /** Claim a NULL-owner orphan channel for the calling user. */
    claim: (fbUserId: string, id: string) =>
      request<{ ok: boolean }>("POST", `/api/line-channels/${encodeURIComponent(id)}/claim`, {
        query: { fb_user_id: fbUserId },
      }),
  },

  linePush: {
    /** List LINE groups the bot has been invited to (from webhook join events). */
    listGroups: (fbUserId: string) =>
      request<{
        data: Array<{
          group_id: string;
          group_name: string;
          label: string;
          channel_id: string | null;
          channel_name: string;
          channel_owner_fb_user_id: string | null;
          joined_at: string | null;
          left_at: string | null;
        }>;
      }>("GET", "/api/line-groups", { query: { fb_user_id: fbUserId } }),
    /** List push configs targeting this group (with campaign nickname joined). */
    listGroupConfigs: (fbUserId: string, groupId: string) =>
      request<{ data: Array<LinePushConfig & { campaign_nickname: string }> }>(
        "GET",
        `/api/line-groups/${encodeURIComponent(groupId)}/push-configs`,
        { query: { fb_user_id: fbUserId } },
      ),
    /** Re-fetch a group's display name from LINE (manual backfill / rename pickup). */
    refreshGroupName: (groupId: string) =>
      request<{ ok: boolean; group_name: string }>(
        "POST",
        `/api/line-groups/${encodeURIComponent(groupId)}/refresh-name`,
      ),
    /** Bulk refresh: re-fetch every active group's display name AND mark
     *  any whose membership ended (LINE returns no summary) as left.
     *  Scoped to channels owned by `fbUserId`. */
    refreshAllGroups: (fbUserId: string) =>
      request<{ ok: boolean; refreshed: number; marked_left: number }>(
        "POST",
        "/api/line-groups/refresh-all",
        { query: { fb_user_id: fbUserId } },
      ),
    upsertConfig: (fbUserId: string, payload: LinePushConfigInput) =>
      request<{ ok: boolean; data: LinePushConfig }>("POST", "/api/line-push/configs", {
        body: payload,
        query: { fb_user_id: fbUserId },
      }),
    deleteConfig: (fbUserId: string, id: string) =>
      request<{ ok: boolean }>("DELETE", `/api/line-push/configs/${encodeURIComponent(id)}`, {
        query: { fb_user_id: fbUserId },
      }),
    /** Fire a push immediately without advancing next_run_at. */
    test: (fbUserId: string, id: string) =>
      request<{ ok: boolean }>("POST", `/api/line-push/configs/${encodeURIComponent(id)}/test`, {
        query: { fb_user_id: fbUserId },
      }),
    listLogs: (configId?: string, limit = 20) =>
      request<{
        data: Array<{
          id: number;
          config_id: string | null;
          run_at: string | null;
          success: boolean;
          error: string | null;
          message_preview: string | null;
        }>;
      }>("GET", "/api/line-push/logs", {
        query: { config_id: configId, limit: String(limit) },
      }),
  },

  settings: {
    /** Fetch all per-user settings for the given FB user id. */
    getUser: (fbUserId: string) =>
      request<{ data: Record<string, unknown> }>(
        "GET",
        `/api/settings/user/${encodeURIComponent(fbUserId)}`,
      ),
    /** Upsert one per-user setting. Value can be any JSON-serialisable. */
    setUser: (fbUserId: string, key: string, value: unknown) =>
      request<{ ok: boolean }>(
        "POST",
        `/api/settings/user/${encodeURIComponent(fbUserId)}/${encodeURIComponent(key)}`,
        { body: { value } },
      ),
    /** Fetch all team-wide shared settings. */
    getShared: () => request<{ data: Record<string, unknown> }>("GET", "/api/settings/shared"),
    /** Upsert one team-wide shared setting. */
    setShared: (key: string, value: unknown) =>
      request<{ ok: boolean }>("POST", `/api/settings/shared/${encodeURIComponent(key)}`, {
        body: { value },
      }),
  },

  pricing: {
    /** Public — returns tier configs for the /pricing comparison page. */
    config: () => request<PricingConfigResponse>("GET", "/api/pricing/config"),
  },

  billing: {
    /** Get the calling user's subscription state + tier limits. */
    me: (fbUserId: string) =>
      request<{ data: SubscriptionState }>("GET", "/api/billing/me", {
        query: { fb_user_id: fbUserId },
      }),
    /** Create a Polar checkout session and return its hosted URL. */
    checkout: (input: { tier: TierId; fbUserId: string; email?: string }) =>
      request<{ url: string; checkout_id?: string }>("POST", "/api/billing/checkout", {
        body: { tier: input.tier, fb_user_id: input.fbUserId, email: input.email },
      }),
    /** Generate a Polar customer-portal URL for self-serve management. */
    portal: (fbUserId: string) =>
      request<{ url: string }>("POST", "/api/billing/portal", {
        body: { fb_user_id: fbUserId },
      }),
    /** Engineering-mode admin: drop calling user to free tier (testing).
     *  Backend rejects if fb_user_id is not in GRANDFATHERED_USERS. */
    adminResetToFree: (fbUserId: string) =>
      request<{ ok: boolean; tier: string }>("POST", "/api/billing/_admin/reset-to-free", {
        body: { fb_user_id: fbUserId },
      }),
    /** Engineering-mode admin: re-apply grandfather Max state. */
    adminRestoreGrandfather: (fbUserId: string) =>
      request<{ ok: boolean; tier: string }>("POST", "/api/billing/_admin/restore-grandfather", {
        body: { fb_user_id: fbUserId },
      }),
  },
};

// ── Pricing / Billing types ───────────────────────────────────

export type TierId = "free" | "basic" | "plus" | "max";

/** One tier row from /api/pricing/config. -1 on a *_limit means
 * "unlimited" (the Max tier). */
export interface PricingTier {
  tier: TierId;
  name: string;
  price_monthly: number;
  price_monthly_full: number;
  ad_accounts_limit: number;
  line_channels_limit: number;
  line_groups_limit: number;
  monthly_push_limit: number;
}

export interface PricingConfigResponse {
  currency: string;
  trial_days: number;
  tiers: PricingTier[];
}

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "inactive";

/** Shape returned by /api/billing/me — flattened row from the
 * `subscriptions` table plus tier defaults when no row exists. */
export interface SubscriptionState {
  tier: TierId;
  status: SubscriptionStatus;
  ad_accounts_limit: number;
  line_channels_limit: number;
  line_groups_limit: number;
  monthly_push_limit: number | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grandfathered: boolean;
  polar_customer_id: string | null;
  polar_subscription_id: string | null;
}

export type Api = typeof api;
