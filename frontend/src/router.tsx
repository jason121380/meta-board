import { Shell } from "@/layout/Shell";
import { AlertsView } from "@/views/alerts/AlertsView";
import { AnalyticsView } from "@/views/analytics/AnalyticsView";
import { DashboardView } from "@/views/dashboard/DashboardView";
import { FinanceView } from "@/views/finance/FinanceView";
import { QuickLaunchView } from "@/views/launch/QuickLaunchView";
import { SettingsView } from "@/views/settings/SettingsView";
import { Navigate, createBrowserRouter } from "react-router-dom";

/**
 * Browser router — 6 authenticated routes inside a <Shell/> layout
 * route, plus a root redirect. The auth guard is NOT in the router:
 * <App/> conditionally renders <LoginView/> vs <RouterProvider/>
 * based on useFbAuth().status, so unauthenticated users never see
 * any protected route path.
 */
export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardView /> },
      { path: "analytics", element: <AnalyticsView /> },
      { path: "alerts", element: <AlertsView /> },
      { path: "finance", element: <FinanceView /> },
      { path: "launch", element: <QuickLaunchView /> },
      { path: "settings", element: <SettingsView /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
