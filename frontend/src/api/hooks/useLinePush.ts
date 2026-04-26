import { type LinePushConfig, type LinePushConfigInput, api } from "@/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the LINE push feature.
 *
 * Scope:
 *   - useLineGroups()                 — all groups the bot is in
 *   - useUpdateLineGroupLabel()       — rename a group
 *   - useLinePushConfigs(campaignId)  — configs for one campaign
 *   - useSaveLinePushConfig()         — create / update
 *   - useDeleteLinePushConfig()       — delete
 *   - useTestLinePush()               — fire a push immediately
 */

const GROUPS_KEY = ["lineGroups"] as const;
const CONFIGS_KEY = (campaignId: string) => ["linePush", "configs", campaignId] as const;

export function useLineGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async () => (await api.linePush.listGroups()).data,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useUpdateLineGroupLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, label }: { groupId: string; label: string }) =>
      api.linePush.setGroupLabel(groupId, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
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

export function useLinePushConfigs(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: CONFIGS_KEY(campaignId ?? ""),
    queryFn: async (): Promise<LinePushConfig[]> =>
      (await api.linePush.listConfigs(campaignId ?? undefined)).data,
    enabled: !!campaignId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useSaveLinePushConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LinePushConfigInput) => api.linePush.upsertConfig(payload),
    onSuccess: (_res, payload) => {
      qc.invalidateQueries({ queryKey: CONFIGS_KEY(payload.campaign_id) });
    },
  });
}

export function useDeleteLinePushConfig(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.linePush.deleteConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIGS_KEY(campaignId) });
    },
  });
}

export function useTestLinePush() {
  return useMutation({
    mutationFn: (id: string) => api.linePush.test(id),
  });
}
