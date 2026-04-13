import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch campaigns for an account at a given date range.
 * Normalization: we inject `_accountId` + `_accountName` onto every
 * campaign so downstream render code can show the account name on
 * multi-account rows. This matches the legacy `campData[acc.id] =
 * resData.map(c => ({...c, _accountId, _accountName}))` pattern.
 */
export function useCampaigns(
  accountId: string | undefined,
  accountName: string | undefined,
  date: DateConfig,
  opts?: { includeArchived?: boolean },
) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["campaigns", accountId, date, !!opts?.includeArchived],
    queryFn: async () => {
      if (!accountId) return [];
      const res = await api.accounts.campaigns(accountId, date, opts?.includeArchived);
      return (res.data ?? []).map((c) => ({
        ...c,
        _accountId: accountId,
        _accountName: accountName,
      }));
    },
    enabled: status === "auth" && !!accountId,
    staleTime: 30_000,
  });
}
