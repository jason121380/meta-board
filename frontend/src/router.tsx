import { LoadingState } from "@/components/LoadingState";
import { Shell } from "@/layout/Shell";
import { DashboardView } from "@/views/dashboard/DashboardView";
import { type ReactNode, Suspense, lazy } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";

/**
 * Browser router — 6 authenticated routes inside a <Shell/> layout
 * route, plus a root redirect. The auth guard is NOT in the router:
 * <App/> conditionally renders <LoginView/> vs <RouterProvider/>
 * based on useFbAuth().status, so unauthenticated users never see
 * any protected route path.
 *
 * Code-splitting: only <DashboardView/> ships in the main bundle
 * (it's the landing page). The remaining 5 views are lazy-loaded
 * on demand via React.lazy(). This shrinks the initial JS payload
 * substantially and cuts time-to-first-meaningful-paint.
 *
 * Each lazy import is also exposed as a ``prefetch*`` function so
 * the sidebar can start the network request on hover/touchstart and
 * the view appears instantly when the user actually navigates.
 */

// Memoised import promises so prefetch + lazy resolve to the same chunk.
const importAnalytics = () => import("@/views/analytics/AnalyticsView");
const importAlerts = () => import("@/views/alerts/AlertsView");
const importFinance = () => import("@/views/finance/FinanceView");
const importCreatives = () => import("@/views/creatives/CreativeCenterView");
const importLaunch = () => import("@/views/launch/QuickLaunchView");
const importSettings = () => import("@/views/settings/SettingsView");

const AnalyticsView = lazy(() => importAnalytics().then((m) => ({ default: m.AnalyticsView })));
const AlertsView = lazy(() => importAlerts().then((m) => ({ default: m.AlertsView })));
const FinanceView = lazy(() => importFinance().then((m) => ({ default: m.FinanceView })));
const CreativeCenterView = lazy(() =>
  importCreatives().then((m) => ({ default: m.CreativeCenterView })),
);
const QuickLaunchView = lazy(() => importLaunch().then((m) => ({ default: m.QuickLaunchView })));
const SettingsView = lazy(() => importSettings().then((m) => ({ default: m.SettingsView })));

/** Trigger an early download of a view's JS chunk before navigation. */
export const prefetchView = (path: string): void => {
  switch (path) {
    case "/analytics":
      void importAnalytics();
      return;
    case "/alerts":
      void importAlerts();
      return;
    case "/finance":
      void importFinance();
      return;
    case "/creatives":
      void importCreatives();
      return;
    case "/launch":
      void importLaunch();
      return;
    case "/settings":
      void importSettings();
      return;
  }
};

function lazyView(node: ReactNode) {
  return <Suspense fallback={<LoadingState title="載入頁面中..." />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardView /> },
      { path: "analytics", element: lazyView(<AnalyticsView />) },
      { path: "alerts", element: lazyView(<AlertsView />) },
      { path: "finance", element: lazyView(<FinanceView />) },
      { path: "creatives", element: lazyView(<CreativeCenterView />) },
      { path: "launch", element: lazyView(<QuickLaunchView />) },
      { path: "settings", element: lazyView(<SettingsView />) },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
