import { ApiError, api } from "@/api/client";
import type { FbEntityStatus } from "@/types/fb";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Mutation hooks for entity status + budget changes.
 *
 * Each mutation invalidates the relevant query keys on success so the
 * tree refetches the affected row. On error we leave the cache alone
 * and surface the ApiError for the caller (usually via toast/alert).
 *
 * CLAUDE.md requires a confirm() dialog BEFORE these fire — the tree
 * row UI handles that and only calls mutate() after the user clicks OK.
 */

export type EntityKind = "campaign" | "adset" | "creative";

export interface StatusMutationInput {
  kind: EntityKind;
  id: string;
  status: FbEntityStatus;
}

export function useEntityStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StatusMutationInput) => {
      if (input.kind === "campaign") {
        return api.campaigns.setStatus(input.id, input.status);
      }
      if (input.kind === "adset") {
        return api.adsets.setStatus(input.id, input.status);
      }
      return api.creatives.setStatus(input.id, input.status);
    },
    onSuccess: (_data, input) => {
      // Invalidate the relevant slice of the cache. We could try to be
      // surgical and only invalidate the exact affected row, but the
      // legacy dashboard just re-fetches everything on mutation, and
      // the user rarely toggles status more than once every few seconds.
      if (input.kind === "campaign") {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else if (input.kind === "adset") {
        qc.invalidateQueries({ queryKey: ["adsets"] });
      } else {
        qc.invalidateQueries({ queryKey: ["creatives"] });
      }
    },
  });
}

export interface BudgetMutationInput {
  kind: "campaign" | "adset";
  id: string;
  dailyBudget: number;
}

export function useEntityBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BudgetMutationInput) => {
      if (input.kind === "campaign") {
        return api.campaigns.setBudget(input.id, input.dailyBudget);
      }
      return api.adsets.setBudget(input.id, input.dailyBudget);
    },
    onSuccess: (_data, input) => {
      if (input.kind === "campaign") {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      } else {
        qc.invalidateQueries({ queryKey: ["adsets"] });
      }
    },
  });
}

/** Extract a user-friendly error message from a thrown ApiError. */
export function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return String(error);
}
