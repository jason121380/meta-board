import { useEffect, useState } from "react";

/**
 * iOS install hint — a small dismissable banner that explains how to
 * add the app to the home screen on iOS Safari, where there is no
 * automatic ``beforeinstallprompt`` event.
 *
 * Displays only when ALL of these are true:
 *   - User-Agent indicates iOS Safari (not Chrome/Firefox on iOS)
 *   - The page is NOT already running standalone (i.e. not opened
 *     from a previous install)
 *   - The user hasn't dismissed the banner before (localStorage flag)
 *
 * Android Chrome / desktop browsers fire ``beforeinstallprompt``
 * automatically so we don't need a manual hint there.
 */

const DISMISSED_KEY = "metadash_pwa_hint_dismissed";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  // Chrome on iOS contains "CriOS"; Firefox contains "FxiOS"; Edge has "EdgiOS".
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && !isOtherBrowser;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses a non-standard navigator.standalone flag.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return false;
}

export function PwaInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    // Show after a 2s delay so the user has a moment to land on the
    // page before a banner pops up.
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  };

  return (
    <aside
      aria-label="安裝到主畫面提示"
      className="fixed inset-x-3 bottom-3 z-[950] rounded-2xl border border-orange-border bg-white p-4 shadow-md animate-fade-in md:left-auto md:right-4 md:max-w-[360px]"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-bg text-lg">
          <span aria-hidden="true">📱</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">加到主畫面</div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-gray-500">
            把 LURE META 加到主畫面，下次直接從 icon 點開，速度更快、體驗像 App。
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="關閉提示"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 active:bg-orange-bg active:text-orange"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="mt-2 rounded-xl bg-orange-bg px-3 py-2 text-[12px] text-gray-500">
        點下方 Safari 工具列的{" "}
        <span className="inline-block font-semibold text-orange" aria-hidden="true">
          ⎙ 分享
        </span>{" "}
        → 選擇 <span className="inline-block font-semibold text-orange">「加入主畫面」</span>。
      </div>
    </aside>
  );
}
