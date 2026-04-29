import { type LinePushConfigInput, api } from "@/api/client";
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

const GROUPS_KEY = ["lineGroups"] as const;
const GROUP_CONFIGS_PREFIX = ["lineGroupConfigs"] as const;

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
  return useMutation({
    mutationFn: (payload: LinePushConfigInput) => api.linePush.upsertConfig(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP_CONFIGS_PREFIX });
    },
  });
}

export function useDeleteLinePushConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.linePush.deleteConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP_CONFIGS_PREFIX });
    },
  });
}

export function useTestLinePush() {
  return useMutation({
    mutationFn: (id: string) => api.linePush.test(id),
  });
}
