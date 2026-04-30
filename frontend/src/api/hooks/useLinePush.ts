import { type LinePushConfigInput, api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the LINE push feature.
 *
 * Scope:
 *   - useLineGroups()                 — all groups the bot is in
 *   - useLineGroupPushConfigs(gid)    — configs for one group
 *   - useSaveLinePushConfig()         — create / update
 *   - useDeleteLinePushConfig()       — delete
 *   - useTestLinePush()               — fire a push immediately
 *
 * Note: per-campaign listing was removed when the dashboard's per-row
 * LINE push button was retired (2026-04-29). The group-nickname
 * (`label`) feature was removed (2026-04-29) — group display name now
 * comes solely from LINE's `/v2/bot/group/{id}/summary`. All push
 * configuration happens via the Settings → LINE 推播設定 page.
 */

const CHANNELS_KEY = ["lineChannels"] as const;
const GROUPS_KEY = ["lineGroups"] as const;
const GROUP_CONFIGS_PREFIX = ["lineGroupConfigs"] as const;

// ── Channels (multi-OA, per-user) ─────────────────────────────
//
// All channel ops require the current FB user id (server-side
// ownership gate). The hooks pull it from FbAuthProvider so callers
// don't have to thread it manually.

export function useLineChannels() {
  const { user } = useFbAuth();
  const uid = user?.id ?? "";
  return useQuery({
    queryKey: ["lineChannels", uid] as const,
    queryFn: async () => (await api.lineChannels.list(uid)).data,
    enabled: !!uid,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useCreateLineChannel() {
  const qc = useQueryClient();
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.lineChannels.create>[1]) =>
      api.lineChannels.create(user?.id ?? "", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useUpdateLineChannel() {
  const qc = useQueryClient();
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.lineChannels.update>[2] }) =>
      api.lineChannels.update(user?.id ?? "", id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useDeleteLineChannel() {
  const qc = useQueryClient();
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: (id: string) => api.lineChannels.delete(user?.id ?? "", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useLineGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async () => (await api.linePush.listGroups()).data,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useRefreshLineGroupName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => api.linePush.refreshGroupName(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useLineGroupPushConfigs(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ["lineGroupConfigs", groupId ?? ""] as const,
    queryFn: async () => (await api.linePush.listGroupConfigs(groupId ?? "")).data,
    enabled: !!groupId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useSaveLinePushConfig() {
  const qc = useQueryClient();
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: (payload: LinePushConfigInput) =>
      api.linePush.upsertConfig(user?.id ?? "", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP_CONFIGS_PREFIX });
    },
  });
}

export function useDeleteLinePushConfig() {
  const qc = useQueryClient();
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: (id: string) => api.linePush.deleteConfig(user?.id ?? "", id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP_CONFIGS_PREFIX });
    },
  });
}

export function useTestLinePush() {
  const { user } = useFbAuth();
  return useMutation({
    mutationFn: (id: string) => api.linePush.test(user?.id ?? "", id),
  });
}
