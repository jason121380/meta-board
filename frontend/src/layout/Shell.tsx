import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/**
 * Authenticated app shell — fixed sidebar on the left, flex main
 * content on the right. The <Outlet/> renders whichever view the
 * current route matched.
 *
 * Layout ported from dashboard.html lines 56–62:
 *   .layout   { display: flex; height: 100vh; overflow: hidden; }
 *   .main     { margin-left: 220px; flex: 1; height: 100vh;
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

  return (
    <div className="shell-root flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      {mobileOpen && (
        <button
          type="button"
          aria-label="關閉側邊欄"
          className="shell-backdrop fixed inset-0 z-[90] hidden bg-black/40"
          onClick={closeOnBackdrop}
        />
      )}
      <main className="shell-main ml-[220px] flex h-screen flex-1 flex-col overflow-hidden bg-bg">
        {/* Mobile hamburger lives at the top of main so it renders
            inside every view's topbar area; actual button is rendered
            by Topbar via the MobileToggleContext below. */}
        <MobileToggleContext.Provider value={() => setMobileOpen((v) => !v)}>
          <Outlet />
        </MobileToggleContext.Provider>
      </main>
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
