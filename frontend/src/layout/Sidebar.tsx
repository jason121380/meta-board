import { useFbAuth } from "@/auth/FbAuthProvider";
import { cn } from "@/lib/cn";
import { useState } from "react";
import { NavLink } from "react-router-dom";

/**
 * Left sidebar — 220px fixed, 60px logo header, nav items, user
 * dropdown at the bottom that opens upward.
 *
 * Layout and behavior ported from dashboard.html lines 801–843.
 * Six nav items: 儀表板 / 數據分析 / 警示列表 / 財務專區 / 快速上架 / 設定.
 */

interface NavItem {
  to: string;
  icon: JSX.Element;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "儀表板",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    to: "/analytics",
    label: "數據分析",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    to: "/alerts",
    label: "警示列表",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    to: "/finance",
    label: "財務專區",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
];

const TOOL_ITEMS: NavItem[] = [
  {
    to: "/launch",
    label: "快速上架",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "設定",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, logout } = useFbAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside
      data-mobile-open={mobileOpen ? "true" : "false"}
      className={cn(
        "shell-sidebar fixed inset-y-0 left-0 z-[100] flex w-[220px] flex-col overflow-y-auto border-r border-border bg-white",
      )}
      onClick={() => {
        // Tapping a link inside the sidebar triggers a route change
        // (handled in Shell's useEffect) which auto-closes. This extra
        // onClick is a belt-and-suspenders close for non-link children.
        if (onMobileClose && mobileOpen) onMobileClose();
      }}
    >
      {/* Logo header */}
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="text-[15px] font-bold tracking-[-0.2px] text-ink">
          METADASH <span className="text-orange">by LURE</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5">
        <div className="px-2.5 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.8px] text-gray-300">
          主選單
        </div>
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}

        <div className="mt-2 px-2.5 pt-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.8px] text-gray-300">
          工具
        </div>
        {TOOL_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      {/* User dropdown — opens upward from the bottom */}
      <div className="mt-auto border-t border-border px-2 py-2.5">
        <div className="relative" onMouseLeave={() => setMenuOpen(false)}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "flex w-full select-none items-center gap-2 rounded-lg px-2.5 py-2",
              "bg-transparent hover:bg-transparent", // no hover per style.md
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-bg text-[11px] font-bold text-orange">
              {user?.pictureUrl ? (
                <img src={user.pictureUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (user?.name?.[0] ?? "?").toUpperCase()
              )}
            </div>
            <span className="flex-1 truncate text-left text-xs font-semibold text-ink">
              {user?.name ?? ""}
            </span>
          </button>

          {menuOpen && (
            <div
              className={cn(
                "absolute bottom-[calc(100%+8px)] left-0 z-[999]",
                "w-[210px] rounded-xl border-[1.5px] border-border bg-white p-1.5 shadow-md",
              )}
            >
              <div className="mb-1 border-b border-border px-2.5 pb-1.5 pt-2 text-xs font-bold text-ink">
                <div>{user?.name}</div>
                <div className="text-[11px] font-normal text-gray-300">Facebook 帳號</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-gray-500 hover:bg-orange-bg hover:text-orange"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "mb-0.5 flex select-none items-center gap-2.5 rounded-xl px-3.5 py-[11px]",
          "text-sm font-medium transition-[all] duration-150 cursor-pointer",
          isActive
            ? "bg-orange-bg font-semibold text-orange"
            : "text-gray-500 hover:bg-orange-bg hover:text-orange",
        )
      }
    >
      <span className="flex w-[22px] shrink-0 items-center justify-center text-[17px]">
        {item.icon}
      </span>
      {item.label}
    </NavLink>
  );
}
