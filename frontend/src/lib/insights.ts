import type { FbBaseEntity, FbInsights } from "@/types/fb";

/**
 * Insights / action helpers — ported from dashboard.html.
 *
 * CLAUDE.md invariants enforced here:
 * - `getMsgCount` is the single source of truth for message counting.
 *   It MUST use the first-found logic across
 *   `onsite_conversion.messaging_conversation_started_7d` and
 *   `messaging_conversation_started_7d` to avoid double-counting.
 * - NEVER use `onsite_conversion.total_messaging_connection` — it
 *   counts total connections, not conversations started, and inflates
 *   the numbers.
 */

/** Extract the first insights row from an entity, or an empty object. */
export function getIns(item: FbBaseEntity): FbInsights {
  return item.insights?.data?.[0] ?? {};
}

/** Get a specific FB action value by action_type, or null. */
export function getAct(item: FbBaseEntity, type: string): string | null {
  const actions = getIns(item).actions;
  if (!actions) return null;
  return actions.find((a) => a.action_type === type)?.value ?? null;
}

const MSG_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
] as const;

/**
 * Get the number of messaging conversations started for an entity.
 * Uses **first-found** logic to avoid double counting: if the entity
 * has both `onsite_conversion.messaging_conversation_started_7d` and
 * `messaging_conversation_started_7d`, we take only the first.
 */
export function getMsgCount(item: FbBaseEntity): number {
  const actions = getIns(item).actions ?? [];
  for (const type of MSG_TYPES) {
    const action = actions.find((a) => a.action_type === type);
    if (action) {
      return Number(action.value) || 0;
    }
  }
  return 0;
}

/** Sum of specific action types (e.g. "purchase", "lead"). */
export function sumAction(item: FbBaseEntity, type: string): number {
  return Number(getAct(item, type) || 0);
}

/** Convenience: numeric spend from an entity's first insights row. */
export function spendOf(item: FbBaseEntity): number {
  return Number(getIns(item).spend || 0);
}
