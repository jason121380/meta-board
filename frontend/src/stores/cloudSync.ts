import { api } from "@/api/client";
import { useAccountsStore } from "./accountsStore";
import { useFiltersStore } from "./filtersStore";
import { useFinanceStore } from "./financeStore";

/**
 * Cross-device user-settings sync against the PostgreSQL-backed
 * `/api/settings/{user_id}` endpoint.
 *
 * Owns persistence for the six fields the backend `UserSettings`
 * Pydantic model cares about (see `main.py:1150-1156`):
 *
 *   selected_accounts   → accountsStore.selectedIds
 *   active_accounts     → accountsStore.activeIds
 *   acct_order          → accountsStore.order
 *   filter_active_only  → filtersStore.activeOnly
 *   fin_row_markups     → financeStore.rowMarkups
 *   fin_markup_default  → financeStore.defaultMarkup
 *
 * Lifecycle (driven by FbAuthProvider):
 *   1. Auth succeeds → `initCloudSync(userId)` hydrates the three
 *      stores from the DB (DB wins over localStorage), THEN installs
 *      a debounced-save subscription.
 *   2. User changes any of the six fields → 500ms after the last
 *      change, the current snapshot is POSTed to
 *      `/api/settings/{userId}`.
 *   3. Logout → `teardownCloudSync()` unsubscribes and flushes any
 *      pending save.
 *
 * Local-first philosophy: every field already has a localStorage
 * backing (via each store's `install*StorageSync`) so the app keeps
 * working without a configured DATABASE_URL. The cloud sync is a
 * **cross-device augmentation**, not a hard dependency — all errors
 * (no DB, offline, first-time user) are swallowed.
 *
 * Why install AFTER hydration: Zustand's `.subscribe()` only fires
 * on future state changes, not on the hydration `setState` calls
 * themselves. Installing AFTER `hydrateFromCloud` therefore skips
 * the redundant "write freshly-loaded DB values right back to DB"
 * round-trip.
 */

interface CloudSettings {
  selected_accounts: string[];
  active_accounts: string[];
  acct_order: string[];
  filter_active_only: boolean;
  fin_row_markups: Record<string, number>;
  fin_markup_default: number;
}

function snapshot(): CloudSettings {
  const a = useAccountsStore.getState();
  const f = useFiltersStore.getState();
  const fin = useFinanceStore.getState();
  return {
    selected_accounts: a.selectedIds,
    active_accounts: a.activeIds,
    acct_order: a.order,
    filter_active_only: f.activeOnly,
    fin_row_markups: fin.rowMarkups,
    fin_markup_default: fin.defaultMarkup,
  };
}

/** One-shot pull from `/api/settings/{userId}`. DB wins over the
 * localStorage state that was hydrated synchronously at app start. */
async function hydrateFromCloud(userId: string): Promise<void> {
  try {
    const res = await api.settings.get(userId);
    const s = res.settings as Partial<CloudSettings> | null;
    if (!s) return; // first-time user — keep whatever localStorage had
    if (Array.isArray(s.selected_accounts)) {
      useAccountsStore.setState({ selectedIds: s.selected_accounts });
    }
    if (Array.isArray(s.active_accounts)) {
      useAccountsStore.setState({ activeIds: s.active_accounts });
    }
    if (Array.isArray(s.acct_order)) {
      useAccountsStore.setState({ order: s.acct_order });
    }
    if (typeof s.filter_active_only === "boolean") {
      useFiltersStore.setState({ activeOnly: s.filter_active_only });
    }
    if (s.fin_row_markups && typeof s.fin_row_markups === "object") {
      useFinanceStore.setState({ rowMarkups: s.fin_row_markups });
    }
    if (typeof s.fin_markup_default === "number") {
      useFinanceStore.setState({ defaultMarkup: s.fin_markup_default });
    }
  } catch {
    /* DB not configured / offline / 5xx — fall back to localStorage */
  }
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudSyncUninstall: (() => void) | null = null;
const SAVE_DEBOUNCE_MS = 500;

async function flushSave(userId: string): Promise<void> {
  pendingSaveTimer = null;
  try {
    // The backend accepts a plain UserSettings JSON body; the Record
    // cast is because api.settings.save's generic parameter is a
    // structural Record<string, unknown> rather than a named type.
    await api.settings.save(userId, snapshot() as unknown as Record<string, unknown>);
  } catch {
    /* DB not configured / offline — localStorage is the backup */
  }
}

/** Subscribe to the 3 persisted stores and debounce any change to a
 * single POST /api/settings/{userId} after 500ms of inactivity. */
function installCloudSync(userId: string): () => void {
  const maybeSave = () => {
    if (pendingSaveTimer !== null) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => {
      void flushSave(userId);
    }, SAVE_DEBOUNCE_MS);
  };

  const offAccounts = useAccountsStore.subscribe((state, prev) => {
    if (
      state.selectedIds !== prev.selectedIds ||
      state.activeIds !== prev.activeIds ||
      state.order !== prev.order
    ) {
      maybeSave();
    }
  });
  const offFilters = useFiltersStore.subscribe((state, prev) => {
    if (state.activeOnly !== prev.activeOnly) maybeSave();
  });
  const offFinance = useFinanceStore.subscribe((state, prev) => {
    if (state.rowMarkups !== prev.rowMarkups || state.defaultMarkup !== prev.defaultMarkup) {
      maybeSave();
    }
  });

  return () => {
    offAccounts();
    offFilters();
    offFinance();
    if (pendingSaveTimer !== null) {
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
    }
  };
}

/**
 * Public entry point — call from FbAuthProvider after a successful
 * token exchange. Hydrates from DB, then installs the save
 * subscription. Idempotent: re-calling with the same userId is a
 * no-op except for re-fetching the latest DB state; re-calling with
 * a DIFFERENT userId (e.g. logged out and back in as someone else)
 * tears down the previous subscription first so the old user's
 * changes never get saved against the new user's row.
 */
export async function initCloudSync(userId: string): Promise<void> {
  if (!userId) return;
  if (cloudSyncUninstall) {
    cloudSyncUninstall();
    cloudSyncUninstall = null;
  }
  await hydrateFromCloud(userId);
  cloudSyncUninstall = installCloudSync(userId);
}

/** Public entry point — call on logout so the previous user's
 * subscription doesn't linger and mutate localStorage-backed state
 * into someone else's DB row. */
export function teardownCloudSync(): void {
  if (cloudSyncUninstall) {
    cloudSyncUninstall();
    cloudSyncUninstall = null;
  }
  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
}
