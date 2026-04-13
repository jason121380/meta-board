import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch the full list of the user's ad accounts. Cached for 5 min
 * (legacy behavior: the dashboard only re-fetches accounts on login
 * or manual refresh). Gated on auth so we never fire unauthenticated.
 */
export function useAccounts() {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.accounts.list().then((r) => r.data),
    enabled: status === "auth",
    staleTime: 5 * 60 * 1000,
  });
}
