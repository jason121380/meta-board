/**
 * Facebook ad account status → human label + color mapping.
 * Ported verbatim from the original design line 1275–1281.
 *
 * FB's `account_status` is an integer with these documented values:
 *  1   ACTIVE
 *  2   DISABLED
 *  3   UNSETTLED
 *  7   PENDING_REVIEW
 *  8   PENDING_SETTLEMENT
 *  9   IN_GRACE_PERIOD
 *  100 PENDING_CLOSURE
 *  101 TEMPORARILY_UNAVAILABLE
 */

export type AccountStatusColor = "green" | "red" | "yellow";

const LABELS: Record<number, string> = {
  1: "正常",
  2: "停用",
  3: "欠費",
  7: "待審核",
  8: "待結算",
  9: "寬限期",
  100: "待關閉",
  101: "暫時不可用",
};

const COLORS: Record<number, AccountStatusColor> = {
  1: "green",
  2: "red",
  3: "red",
  7: "yellow",
  8: "yellow",
  9: "yellow",
  100: "red",
  101: "yellow",
};

export function accountStatusLabel(status: number): string {
  return LABELS[status] ?? `狀態${status}`;
}

export function accountStatusColor(status: number): AccountStatusColor {
  return COLORS[status] ?? "yellow";
}

/** "on" (enabled/active) / "off" (disabled) for the dash-acct-dot indicator. */
export function accountDotState(status: number): "on" | "off" {
  return status === 1 ? "on" : "off";
}
