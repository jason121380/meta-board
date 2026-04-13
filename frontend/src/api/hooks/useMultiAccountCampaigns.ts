import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAccount, FbCampaign } from "@/types/fb";
import { useQueries } from "@tanstack/react-query";

/**
 * Parallel campaigns fetch for a list of accounts. Returns a flat
 * array of campaigns across all accounts with `_accountId` and
 * `_accountName` injected onto every row (matches legacy dashboard
 * shape so downstream render code is unchanged).
 *
 * Uses the internal fallback from main.py: if include_archived true
 * causes FB to strip insights, the backend retries without it. So
 * the hook always asks for archived by default.
 */
export interface MultiCampaignsResult {
  campaigns: FbCampaign[];
  /** true while ANY account is still loading. */
  isLoading: boolean;
  /** true if ALL selected accounts errored. */
  isError: boolean;
  /** Per-account error messages, keyed by account id. */
  errors: Record<string, string>;
}

export function useMultiAccountCampaigns(
  accounts: FbAccount[],
  date: DateConfig,
  opts: { includeArchived?: boolean } = {},
): MultiCampaignsResult {
  const { status } = useFbAuth();
  const queries = useQueries({
    queries: accounts.map((acc) => ({
      queryKey: ["campaigns", acc.id, date, !!opts.includeArchived],
      queryFn: async (): Promise<FbCampaign[]> => {
        const res = await api.accounts.campaigns(acc.id, date, opts.includeArchived);
        return (res.data ?? []).map((c) => ({
          ...c,
          _accountId: acc.id,
          _accountName: acc.name,
        }));
      },
      enabled: status === "auth",
      staleTime: 30_000,
    })),
  });

  const campaigns: FbCampaign[] = [];
  const errors: Record<string, string> = {};
  let isLoading = false;
  let allErrored = accounts.length > 0;

  accounts.forEach((acc, i) => {
    const q = queries[i];
    if (!q) return;
    if (q.isLoading) isLoading = true;
    if (q.isError) {
      errors[acc.id] = q.error instanceof Error ? q.error.message : "Unknown error";
    } else {
      allErrored = false;
      const rows = (q.data as FbCampaign[] | undefined) ?? [];
      campaigns.push(...rows);
    }
  });

  return { campaigns, isLoading, isError: allErrored, errors };
}
