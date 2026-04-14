import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

const queryClient = new QueryClient({
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

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
