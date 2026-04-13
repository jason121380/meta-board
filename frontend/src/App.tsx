import { FbAuthProvider, useFbAuth } from "@/auth/FbAuthProvider";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";
import { router } from "@/router";
import { hydrateAllStores, installStorageSync } from "@/stores";
import { LoginView } from "@/views/login/LoginView";
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
 * - Mounts <ConfirmDialogHost/> at the root so `confirm()` works
 *   globally without threading state through props.
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

  return (
    <FbAuthProvider>
      <AuthGate />
      <ConfirmDialogHost />
    </FbAuthProvider>
  );
}

function AuthGate() {
  const { status } = useFbAuth();
  if (status === "auth") {
    return <RouterProvider router={router} />;
  }
  return <LoginView />;
}
