import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Read the calling user's subscription state. Returns free-tier
 * defaults when the user has no `subscriptions` row, so the
 * consumer never has to special-case "first-time visitor".
 *
 * Cached for 60s — subscription state changes via webhook (rare),
 * not by user action, so we don't need second-level freshness.
 */
export function useSubscription() {
  const { status, user } = useFbAuth();
  const fbUserId = user?.id ?? "";
  return useQuery({
    queryKey: ["billing", "me", fbUserId],
    queryFn: () => api.billing.me(fbUserId),
    enabled: status === "auth" && fbUserId.length > 0,
    staleTime: 60_000,
    select: (resp) => resp.data,
  });
}

/**
 * Public pricing config for the /pricing comparison page. Cached
 * indefinitely — the tier table only changes on a deploy.
 */
export function usePricingConfig() {
  return useQuery({
    queryKey: ["pricing", "config"],
    queryFn: () => api.pricing.config(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Live tier-limit usage — fed into "X / Y 已使用" indicators on
 * the affected settings pages and into the at-limit interception
 * before save / add actions. Re-fetches on window focus so usage
 * stays fresh after a save in another tab.
 */
export function useBillingUsage() {
  const { status, user } = useFbAuth();
  const fbUserId = user?.id ?? "";
  return useQuery({
    queryKey: ["billing", "usage", fbUserId],
    queryFn: () => api.billing.usage(fbUserId),
    enabled: status === "auth" && fbUserId.length > 0,
    staleTime: 30_000,
    select: (resp) => resp.data,
  });
}
