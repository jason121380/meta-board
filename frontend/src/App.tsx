import { FbAuthProvider, useFbAuth } from "@/auth/FbAuthProvider";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { ToastHost } from "@/components/Toast";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { router } from "@/router";
import { hydrateAllStores, installStorageSync } from "@/stores";
import { LoginView } from "@/views/login/LoginView";
import { ShareReportPage } from "@/views/report/ShareReportPage";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

/**
 * Root application component.
 *
 * - Hydrates Zustand stores from localStorage BEFORE the first render
 *   so views never see empty state on mount.
 * - Wraps everything in <FbAuthProvider> so useFbAuth() works anywhere.
 * - Shows <LoginView/> while unauthenticated; only mounts the
 *   <RouterProvider/> after the FB SDK reports connected status.
 * - Mounts <ConfirmDialogHost/> + <ToastHost/> at the root so
 *   `confirm()` / `toast()` work globally without prop drilling.
 */

// Hydrate at module load time — runs once per page load, before
// <App/> mounts. This is safe because Zustand stores are module-level
// singletons and localStorage is synchronous.
hydrateAllStores();

export function App() {
  useEffect(() => {
    const cleanup = installStorageSync();
    return cleanup;
  }, []);

  // Public share-report route — bypasses the FB auth gate entirely.
  // The backend endpoints use a server-side shared token, so link
  // recipients can view the report without logging in themselves.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/r/")) {
    return (
      <>
        <ShareReportPage />
        <ToastHost />
      </>
    );
  }

  return (
    <FbAuthProvider>
      <AuthGate />
      <ConfirmDialogHost />
      <ToastHost />
    </FbAuthProvider>
  );
}

function AuthGate() {
  const { status } = useFbAuth();
  if (status === "auth") {
    return (
      <SettingsProvider>
        <RouterProvider router={router} />
        <PwaInstallHint />
      </SettingsProvider>
    );
  }
  return <LoginView />;
}
