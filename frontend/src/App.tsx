import { FbAuthProvider, ShareModeAuthProvider, useFbAuth } from "@/auth/FbAuthProvider";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";
import { LoadingState } from "@/components/LoadingState";
import { PwaInstallHint } from "@/components/PwaInstallHint";
import { ToastHost } from "@/components/Toast";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { router } from "@/router";
import { hydrateAllStores, installStorageSync } from "@/stores";
import { LoginView } from "@/views/login/LoginView";
import { ShareReportPage } from "@/views/report/ShareReportPage";
import { Suspense, lazy, useEffect } from "react";
import { RouterProvider } from "react-router-dom";

// Public /pricing — accessible without login. Lazy-loaded so the
// LoginView bundle doesn't grow when 99% of visitors never see it.
const PublicPricingView = lazy(() =>
  import("@/views/pricing/PricingView").then((m) => ({ default: m.PricingView })),
);

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
  //
  // We still wrap in ShareModeAuthProvider so any descendant calling
  // `useFbAuth()` (e.g. CreativePreviewModal's image hooks) gets a
  // stub "auth" context instead of throwing. Without it, tapping the
  // 3rd-level ad card on the share page crashes the whole tree →
  // blank white screen.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/r/")) {
    return (
      <ShareModeAuthProvider>
        <ShareReportPage />
        <ToastHost />
      </ShareModeAuthProvider>
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
  // /pricing is a public marketing page — anonymous visitors see it
  // without bouncing through the LoginView. Logged-in users still
  // get the page via the in-Shell route (with sidebar). Match either
  // /pricing or /pricing/ so trailing slashes don't break it.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const isPricingPath = path === "/pricing" || path === "/pricing/";

  if (status === "auth") {
    return (
      <SettingsProvider>
        <RouterProvider router={router} />
        <PwaInstallHint />
      </SettingsProvider>
    );
  }
  if (isPricingPath) {
    return (
      <Suspense fallback={<LoadingState title="載入方案中..." />}>
        <PublicPricingView />
      </Suspense>
    );
  }
  // While the FB SDK is still resolving the cached token (status:
  // "checking"), don't fall through to LoginView — that page's
  // METADASH-by-LURE branding looks like a forced re-login to users
  // who already have a valid session in localStorage. A small
  // centered spinner is more accurate: we're just verifying the
  // cached credential. After lazy-route reloads (e.g. clicking a
  // newly-deployed page that triggers withReloadOnChunkError), this
  // is the brief moment between page load and exchangeToken success.
  // Only show LoginView for the genuine "unauth" state.
  if (status === "checking" && hasCachedToken()) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3 text-[13px] text-gray-300">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange border-t-transparent" />
          <span>載入中...</span>
        </div>
      </div>
    );
  }
  return <LoginView />;
}

/** Cheap synchronous check for the cached FB token written by
 *  FbAuthProvider.exchangeToken on every successful login. */
function hasCachedToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem("meta_dash_fb_token");
  } catch {
    return false;
  }
}
