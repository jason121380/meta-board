import { BottomTabBar } from "@/components/BottomTabBar";
import { DataPreloader, didPreload } from "@/components/DataPreloader";
import { EmptyAccountsPrompt } from "@/components/EmptyAccountsPrompt";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/**
 * Authenticated app shell — fixed sidebar on the left, flex main
 * content on the right. The <Outlet/> renders whichever view the
 * current route matched.
 *
 * Layout ported from dashboard.html lines 56–62, with 100vh replaced
 * by 100dvh so mobile Safari's address bar doesn't push the bottom of
 * the view off-screen:
 *   .layout   { display: flex; height: 100dvh; overflow: hidden; }
 *   .main     { margin-left: 220px; flex: 1; height: 100dvh;
 *                overflow: hidden; flex-direction: column; }
 *
 * Mobile (<= 768px): the sidebar slides off-screen and the main
 * content fills the full width. A hamburger button in the topbar
 * (via MobileMenuToggle context helper) toggles the open state.
 * Sidebar auto-closes on route change so clicking a nav item
 * immediately reveals the selected view.
 */
export function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Views (<Outlet/>) are NOT rendered until preloading finishes.
  // This prevents views from firing their own queries (which race
  // with the preloader and produce transient error banners).
  const [preloadDone, setPreloadDone] = useState(didPreload);
  const onPreloadComplete = useCallback(() => setPreloadDone(true), []);
  const { pathname } = useLocation();

  // Close the sidebar whenever the route changes — avoids the
  // "tap nav item, nothing seems to happen" trap where the sidebar
  // covers the new view. `pathname` is the effect trigger; the
  // `void` read satisfies biome's exhaustive-deps check.
  useEffect(() => {
    void pathname;
    setMobileOpen(false);
  }, [pathname]);

  const closeOnBackdrop = useCallback(() => setMobileOpen(false), []);

  // `h-[100dvh]` (dynamic viewport height) NOT `h-screen` (100vh).
  // On iOS Safari, 100vh is the viewport height WITHOUT the browser
  // toolbar, so the app ends up taller than the visible area and
  // the bottom of the dashboard / finance tables scrolls off-screen
  // (the "頁面過長" bug). dvh adjusts to the actual visible viewport,
  // which keeps both views fitting inside the window on every
  // device. Supported in iOS 15.4+ / Chrome 108+.
  return (
    <div className="shell-root flex h-[100dvh] overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      {mobileOpen && (
        <button
          type="button"
          aria-label="關閉側邊欄"
          className="shell-backdrop fixed inset-0 z-[90] hidden bg-black/40"
          onClick={closeOnBackdrop}
        />
      )}
      {/* pb-[60px] on mobile reserves space for the fixed bottom tab
          bar so the last table row / card isn't hidden behind it.
          On desktop (md:) the bottom padding is removed. */}
      <main className="shell-main ml-[220px] flex h-[100dvh] flex-1 flex-col overflow-hidden bg-bg pb-[60px] md:pb-0">
        <MobileToggleContext.Provider value={() => setMobileOpen((v) => !v)}>
          {preloadDone && <Outlet />}
        </MobileToggleContext.Provider>
      </main>
      {preloadDone && <BottomTabBar />}
      {preloadDone && <EmptyAccountsPrompt />}
      <DataPreloader onComplete={onPreloadComplete} />
    </div>
  );
}

// ── Mobile toggle context ───────────────────────────────────
// A tiny context so Topbar can expose a hamburger button without
// every view having to wire up props. The consumer just calls
// `useMobileSidebarToggle()` to get a click handler.
import { createContext, useContext } from "react";
const MobileToggleContext = createContext<(() => void) | null>(null);

/** Hook returning a function that toggles the mobile sidebar. */
export function useMobileSidebarToggle(): () => void {
  const fn = useContext(MobileToggleContext);
  return fn ?? (() => {});
}
