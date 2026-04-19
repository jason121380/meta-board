import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient instance.
 *
 * Lives in its own module so non-React code (e.g. Zustand stores)
 * can call `queryClient.invalidateQueries(...)` after an imperative
 * mutation, without having to plumb the client through React context.
 * main.tsx imports the same instance for the provider.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tree data is keyed by (accountId, dateParam). Refetching is
      // user-driven (date change, refresh button). No background poll.
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      // 5 minutes — long enough that tab-switching between dashboard
      // / analytics / finance / alerts stays instant once data has
      // landed once. The backend cache (60s) acts as the freshness
      // backstop, and the refresh button or a date change always
      // forces a new fetch via invalidateQueries.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    },
  },
});
