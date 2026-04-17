import { api } from "@/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * PostgreSQL-backed settings hooks (replaces the old localStorage-only
 * store persistence for selected accounts, markup rules, pins, etc.).
 *
 * Two scopes:
 *   - useUserSettings(fbUserId) — per-user (needs fb user id)
 *   - useSharedSettings()        — team-wide
 *
 * The corresponding mutations (useSetUserSetting / useSetSharedSetting)
 * optimistically update the query cache, then POST. Callers should
 * debounce noisy inputs (e.g. the markup input) before calling mutate()
 * — see `lib/debounce.ts`.
 */

export type SettingsMap = Record<string, unknown>;

const USER_KEY = (uid: string) => ["settings", "user", uid] as const;
const SHARED_KEY = ["settings", "shared"] as const;

export function useUserSettings(fbUserId: string | null | undefined) {
  return useQuery({
    // queryKey always has a string at index 2 — empty string when
    // disabled means no hit (we use `enabled` to gate).
    queryKey: USER_KEY(fbUserId ?? ""),
    queryFn: async (): Promise<SettingsMap> => {
      const { data } = await api.settings.getUser(fbUserId ?? "");
      return data;
    },
    enabled: !!fbUserId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useSharedSettings() {
  return useQuery({
    queryKey: SHARED_KEY,
    queryFn: async (): Promise<SettingsMap> => {
      const { data } = await api.settings.getShared();
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export interface SetUserSettingInput {
  fbUserId: string;
  key: string;
  value: unknown;
}

export function useSetUserSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fbUserId, key, value }: SetUserSettingInput) =>
      api.settings.setUser(fbUserId, key, value),
    onMutate: async ({ fbUserId, key, value }) => {
      await qc.cancelQueries({ queryKey: USER_KEY(fbUserId) });
      const prev = qc.getQueryData<SettingsMap>(USER_KEY(fbUserId));
      qc.setQueryData<SettingsMap>(USER_KEY(fbUserId), { ...(prev ?? {}), [key]: value });
      return { prev, fbUserId };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev && ctx.fbUserId) qc.setQueryData(USER_KEY(ctx.fbUserId), ctx.prev);
    },
  });
}

export interface SetSharedSettingInput {
  key: string;
  value: unknown;
}

export function useSetSharedSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: SetSharedSettingInput) => api.settings.setShared(key, value),
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: SHARED_KEY });
      const prev = qc.getQueryData<SettingsMap>(SHARED_KEY);
      qc.setQueryData<SettingsMap>(SHARED_KEY, { ...(prev ?? {}), [key]: value });
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(SHARED_KEY, ctx.prev);
    },
  });
}
