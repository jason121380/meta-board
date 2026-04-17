import { api } from "@/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Campaign nicknames — PostgreSQL-backed, shared globally across all
 * authenticated users. Loaded once per session and mutated via upsert.
 *
 * Shape: Record<campaignId, { store, designer }>. Empty strings are
 * valid (one field may be filled while the other is blank).
 */

export interface Nickname {
  store: string;
  designer: string;
}

export type NicknameMap = Record<string, Nickname>;

const NICKNAMES_KEY = ["nicknames"] as const;

export function useNicknames() {
  return useQuery({
    queryKey: NICKNAMES_KEY,
    queryFn: async (): Promise<NicknameMap> => {
      const { data } = await api.nicknames.list();
      const map: NicknameMap = {};
      for (const row of data) {
        map[row.campaign_id] = { store: row.store, designer: row.designer };
      }
      return map;
    },
    // Nicknames change rarely and are cheap to cache aggressively.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export interface SetNicknameInput {
  campaignId: string;
  store: string;
  designer: string;
}

export function useSetNickname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, store, designer }: SetNicknameInput) =>
      api.nicknames.set(campaignId, store, designer),
    onMutate: async (input) => {
      // Optimistic update so the table reflects the new nickname
      // immediately. Rolled back on error.
      await qc.cancelQueries({ queryKey: NICKNAMES_KEY });
      const prev = qc.getQueryData<NicknameMap>(NICKNAMES_KEY);
      const next: NicknameMap = { ...(prev ?? {}) };
      const s = input.store.trim();
      const d = input.designer.trim();
      if (!s && !d) {
        delete next[input.campaignId];
      } else {
        next[input.campaignId] = { store: s, designer: d };
      }
      qc.setQueryData(NICKNAMES_KEY, next);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(NICKNAMES_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: NICKNAMES_KEY });
    },
  });
}
