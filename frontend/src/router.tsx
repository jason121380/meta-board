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
 */
const AnalyticsView = lazy(() =>
  import("@/views/analytics/AnalyticsView").then((m) => ({ default: m.AnalyticsView })),
);
const AlertsView = lazy(() =>
  import("@/views/alerts/AlertsView").then((m) => ({ default: m.AlertsView })),
);
const FinanceView = lazy(() =>
  import("@/views/finance/FinanceView").then((m) => ({ default: m.FinanceView })),
);
const QuickLaunchView = lazy(() =>
  import("@/views/launch/QuickLaunchView").then((m) => ({ default: m.QuickLaunchView })),
);
const SettingsView = lazy(() =>
  import("@/views/settings/SettingsView").then((m) => ({ default: m.SettingsView })),
);

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
      { path: "launch", element: lazyView(<QuickLaunchView />) },
      { path: "settings", element: lazyView(<SettingsView />) },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
