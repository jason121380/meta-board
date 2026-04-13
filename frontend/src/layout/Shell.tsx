import { Outlet } from "react-router-dom";
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
 */
export function Shell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="ml-[220px] flex h-screen flex-1 flex-col overflow-hidden bg-bg">
        <Outlet />
      </main>
    </div>
  );
}
