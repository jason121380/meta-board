import { ApiError, api } from "@/api/client";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Facebook JS SDK provider — replaces the window-level `fbAsyncInit`
 * dance in dashboard.html with a React context. The SDK is loaded
 * exactly once per page using a module-level flag (survives React 18
 * Strict Mode's double-mount behavior).
 *
 * Auth state flow:
 *   1. Load FB SDK script (once)
 *   2. Call FB.getLoginStatus → if 'connected', POST token to FastAPI
 *      /api/auth/token so the server's _runtime_token is set before
 *      TanStack Query starts firing authenticated calls
 *   3. Expose `{status, user, login, logout}` via useFbAuth()
 *
 * The status field mirrors the legacy states: "checking" while SDK
 * loads, "unauth" when not logged in, "auth" after successful login.
 * Errors during token exchange surface via the `error` field.
 */

const FB_APP_ID = "2780372365654462";
const FB_API_VERSION = "v21.0";
const FB_LOCALE = "zh_TW";
const FB_SCOPES = "ads_read,ads_management,business_management";

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

interface FbSdk {
  init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  getLoginStatus: (cb: (resp: FbLoginStatusResponse) => void) => void;
  login: (cb: (resp: FbLoginStatusResponse) => void, opts: { scope: string }) => void;
  logout: (cb?: () => void) => void;
  api: (path: string, params: Record<string, string>, cb: (resp: unknown) => void) => void;
}

interface FbLoginStatusResponse {
  status: "connected" | "not_authorized" | "unknown";
  authResponse?: { accessToken: string; userID: string };
}

export type FbAuthStatus = "checking" | "unauth" | "auth";

export interface FbAuthUser {
  id: string;
  name: string;
  pictureUrl?: string;
}

export interface FbAuthContextValue {
  status: FbAuthStatus;
  user: FbAuthUser | null;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
}

const FbAuthContext = createContext<FbAuthContextValue | null>(null);

// Module-level so double-mount in Strict Mode doesn't re-inject the
// SDK script tag twice.
let sdkLoading = false;
let sdkReady = false;
const sdkCallbacks: Array<() => void> = [];

function ensureSdkLoaded(): Promise<void> {
  if (sdkReady) return Promise.resolve();
  return new Promise((resolve) => {
    sdkCallbacks.push(resolve);
    if (sdkLoading) return;
    sdkLoading = true;

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: true,
        version: FB_API_VERSION,
      });
      sdkReady = true;
      const pending = sdkCallbacks.splice(0);
      for (const fn of pending) fn();
    };

    const d = document;
    const id = "facebook-jssdk";
    if (d.getElementById(id)) return;
    const script = d.createElement("script");
    script.id = id;
    script.src = `https://connect.facebook.net/${FB_LOCALE}/sdk.js`;
    script.async = true;
    script.defer = true;
    d.head.appendChild(script);
  });
}

export function FbAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<FbAuthStatus>("checking");
  const [user, setUser] = useState<FbAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didRunRef = useRef(false);

  const exchangeToken = useCallback(async (token: string) => {
    try {
      const result = await api.auth.setToken(token);
      const name = result.name ?? "User";
      const id = result.id ?? "";
      // Fetch picture via FB.api so we can show avatar
      let pictureUrl: string | undefined;
      try {
        await new Promise<void>((resolve) => {
          window.FB?.api("/me", { fields: "picture.width(80)" }, (resp) => {
            const r = resp as { picture?: { data?: { url?: string } } };
            pictureUrl = r?.picture?.data?.url;
            resolve();
          });
        });
      } catch {
        /* ignore picture fetch failure */
      }
      setUser({ id, name, pictureUrl });
      setStatus("auth");
      setError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : (err as Error).message;
      setError(msg);
      setStatus("unauth");
    }
  }, []);

  useEffect(() => {
    // Guard against React 18 Strict Mode double-invoke so we don't
    // check login status twice. This effect is ONE-SHOT — no cleanup.
    if (didRunRef.current) return;
    didRunRef.current = true;

    // Safety fallback: if the FB SDK never loads (ad blocker, network),
    // reveal the login form after 6 seconds — matches legacy behavior.
    // We do NOT return a cleanup clearing this timer because cleanup
    // would also run on Strict Mode's synthetic unmount and cancel the
    // fallback; we rely on the functional `setStatus(prev => ...)`
    // update to only fire when the status is still "checking".
    setTimeout(() => {
      setStatus((prev) => (prev === "checking" ? "unauth" : prev));
    }, 6000);

    ensureSdkLoaded().then(() => {
      window.FB?.getLoginStatus((resp) => {
        if (resp.status === "connected" && resp.authResponse) {
          void exchangeToken(resp.authResponse.accessToken);
        } else {
          setStatus((prev) => (prev === "checking" ? "unauth" : prev));
        }
      });
    });
  }, [exchangeToken]);

  const login = useCallback(() => {
    ensureSdkLoaded().then(() => {
      window.FB?.login(
        (resp) => {
          if (resp.authResponse) {
            void exchangeToken(resp.authResponse.accessToken);
          }
        },
        { scope: FB_SCOPES },
      );
    });
  }, [exchangeToken]);

  const logout = useCallback(async () => {
    try {
      window.FB?.logout();
    } catch {
      /* ignore */
    }
    try {
      await api.auth.clearToken();
    } catch {
      /* ignore */
    }
    setUser(null);
    setStatus("unauth");
  }, []);

  return (
    <FbAuthContext.Provider value={{ status, user, error, login, logout }}>
      {children}
    </FbAuthContext.Provider>
  );
}

export function useFbAuth(): FbAuthContextValue {
  const ctx = useContext(FbAuthContext);
  if (!ctx) {
    throw new Error("useFbAuth must be used inside <FbAuthProvider>");
  }
  return ctx;
}
