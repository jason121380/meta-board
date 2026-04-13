import { Topbar } from "@/layout/Topbar";

/**
 * Dashboard view — phase 3 will flesh this out with the account panel,
 * stats grid, and 3-level tree table. For now it's a stub that at
 * least renders a valid topbar so routing can be tested.
 */
export function DashboardView() {
  return (
    <>
      <Topbar title="儀表板" />
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Dashboard view — Phase 3 (coming next).
      </div>
    </>
  );
}
