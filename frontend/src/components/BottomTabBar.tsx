import { cn } from "@/lib/cn";
import { prefetchView } from "@/router";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * iOS-style bottom tab bar — shown ONLY on mobile (< 768px).
 *
 * Replaces the hamburger → sidebar navigation pattern with a
 * persistent 5-tab bottom nav that matches iOS HIG:
 *   - Max 5 items (Apple guideline)
 *   - Safe-area-inset-bottom for iPhone home indicator
 *   - Active tab: orange fill + label
 *   - Inactive: gray outline + label
 *   - Prefetches JS chunk on touchstart for instant navigation
 *
 * Hidden on desktop via `md:hidden` — the desktop sidebar remains.
 */

interface TabItem {
  path: string;
  label: string;
  /** Active (filled) icon */
  iconActive: JSX.Element;
  /** Inactive (outline) icon */
  iconInactive: JSX.Element;
}

const TABS: TabItem[] = [
  {
    path: "/dashboard",
    label: "儀表板",
    iconActive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    iconInactive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    path: "/analytics",
    label: "分析",
    iconActive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
      >
        <path d="M4 20h16a1 1 0 000-2H4a1 1 0 000 2zm1-4h2a1 1 0 001-1V9a1 1 0 00-1-1H5a1 1 0 00-1 1v6a1 1 0 001 1zm5 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v10a1 1 0 001 1zm5 0h2a1 1 0 001-1V7a1 1 0 00-1-1h-2a1 1 0 00-1 1v8a1 1 0 001 1z" />
      </svg>
    ),
    iconInactive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="8" width="3" height="8" rx="1" />
        <rect x="10.5" y="4" width="3" height="12" rx="1" />
        <rect x="16" y="6" width="3" height="10" rx="1" />
        <line x1="3" y1="19" x2="21" y2="19" />
      </svg>
    ),
  },
  {
    path: "/alerts",
    label: "警示",
    iconActive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
      >
        <path d="M12 2.5l-8.5 15A1.5 1.5 0 005 20h14a1.5 1.5 0 001.3-2.5l-8.5-15a.3.3 0 00-.6 0zM12 9v4m0 3h.01" />
        <circle cx="12" cy="16" r="0.5" fill="white" />
        <rect x="11.25" y="9" width="1.5" height="4" rx="0.75" fill="white" />
      </svg>
    ),
    iconInactive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    path: "/finance",
    label: "費用",
    iconActive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
      >
        <path d="M12 1a1 1 0 011 1v1.07A7 7 0 0119 10v0a7 7 0 01-6 6.93V22a1 1 0 01-2 0v-5.07A7 7 0 015 10v0a7 7 0 016-6.93V2a1 1 0 011-1zm5 4H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 010 7H7" />
        <circle cx="12" cy="12" r="9" fillOpacity="0.15" />
        <path
          d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    iconInactive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    path: "/settings",
    label: "設定",
    iconActive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    iconInactive: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleTab = useCallback(
    (path: string) => {
      // Haptic feedback on tap (iOS Safari ignores vibrate, but
      // Android Chrome respects it — free UX upgrade there).
      if ("vibrate" in navigator) {
        navigator.vibrate(8);
      }
      prefetchView(path);
      navigate(path);
    },
    [navigate],
  );

  return (
    <nav
      className="btm-tab-bar fixed inset-x-0 bottom-0 z-[200] border-t border-border bg-white/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => handleTab(tab.path)}
              onTouchStart={() => prefetchView(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-2",
                "text-[10px] font-semibold transition-colors duration-150",
                "active:scale-95 active:opacity-80",
                active ? "text-orange" : "text-gray-300",
              )}
            >
              {active ? tab.iconActive : tab.iconInactive}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
