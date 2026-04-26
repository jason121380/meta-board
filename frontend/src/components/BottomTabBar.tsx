import { Modal } from "@/components/Modal";
import { cn } from "@/lib/cn";
import { prefetchView } from "@/router";
import { useCallback, useState } from "react";
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
 * When the app has more than 5 views, the 5th slot becomes "更多"
 * (more) which opens a bottom-sheet Modal listing the overflow
 * items. This keeps the bar at 5 visible tabs while still giving
 * mobile users access to the full desktop-sidebar feature set.
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
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
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
];

// Overflow items — accessible via the "更多" tab (5th slot) instead
// of being crammed into the main bar. Order matches the desktop
// sidebar so users who switch between mobile and desktop don't have
// to re-learn navigation.
interface OverflowItem {
  path: string;
  label: string;
  icon: JSX.Element;
}

const OVERFLOW: OverflowItem[] = [
  {
    path: "/history",
    label: "歷史花費",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-6" />
      </svg>
    ),
  },
  {
    path: "/settings",
    label: "廣告帳號設定",
    icon: (
      <svg
        width="20"
        height="20"
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
  {
    path: "/line-push",
    label: "LINE 推播設定",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    path: "/engineering",
    label: "工程模式",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94L6.92 19.1a2.12 2.12 0 01-3-3l6.08-6.64a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

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

  // The "更多" tab is considered active whenever the current route
  // matches one of the overflow items — this way the highlight stays
  // consistent even when the user lands on e.g. /settings via
  // deep-link instead of tapping 更多 first.
  const moreActive = OVERFLOW.some((item) => pathname.startsWith(item.path));

  return (
    <>
      <nav
        // Explicit 60px intrinsic height keeps this in sync with the
        // `pb-[calc(60px+safe-area)]` reserved in Shell. Without it,
        // the bar leans on icon + padding to derive its own height
        // and any future icon resize would leak under the main view.
        className="btm-tab-bar fixed inset-x-0 bottom-0 z-[200] h-[60px] border-t border-border bg-white/95 backdrop-blur-md md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          // The 60px height covers the tappable row; the safe-area
          // inset extends the bar below it into the home-indicator
          // zone so the border/backdrop visually fill the notch.
          height: "calc(60px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex h-[60px]">
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
          <button
            type="button"
            onClick={() => {
              if ("vibrate" in navigator) navigator.vibrate(8);
              setMoreOpen(true);
            }}
            // Eagerly warm the overflow targets so tapping an item
            // in the sheet feels instant.
            onTouchStart={() => {
              for (const item of OVERFLOW) prefetchView(item.path);
            }}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-2",
              "text-[10px] font-semibold transition-colors duration-150",
              "active:scale-95 active:opacity-80",
              moreActive ? "text-orange" : "text-gray-300",
            )}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreIcon filled={moreActive} />
            <span>更多</span>
          </button>
        </div>
      </nav>
      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="更多" width={320}>
        <ul className="flex flex-col gap-1">
          {OVERFLOW.map((item) => {
            const active = pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    handleTab(item.path);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold",
                    "active:scale-[0.98]",
                    active
                      ? "bg-orange-bg text-orange"
                      : "bg-transparent text-ink hover:bg-orange-bg",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-white text-orange" : "bg-bg text-gray-500",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

function MoreIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? "0" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
