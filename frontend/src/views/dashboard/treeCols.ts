import { getIns, getMsgCount } from "@/lib/insights";
import type { FbBaseEntity } from "@/types/fb";

/**
 * Status sort weight — lower = higher priority. ACTIVE first,
 * PAUSED second, ARCHIVED third, DELETED / unknown last. Gives the
 * tree a useful "what's live at the top" grouping on descending sort.
 */
function statusRank(status: string | undefined): number {
  switch (status) {
    case "ACTIVE":
      return 0;
    case "PAUSED":
      return 1;
    case "ARCHIVED":
      return 2;
    case "DELETED":
      return 3;
    default:
      return 4;
  }
}

/**
 * Name sort uses a hashed numeric surrogate so the TreeTable sort
 * comparator (which assumes numeric return from `sortKey`) still
 * works without refactoring to a Comparator<T>. We use the UTF-16
 * code units of the name so the ordering is deterministic and
 * locale-insensitive (matches legacy the original design behavior). For
 * proper zh-TW collation we'd switch to localeCompare, but that
 * requires touching the TreeTable sorter.
 */
function nameRank(name: string | undefined): number {
  if (!name) return 0;
  // Only use the first ~8 chars so the resulting number stays
  // inside Number.MAX_SAFE_INTEGER after the base-16 weighting.
  const sample = name.slice(0, 8);
  let rank = 0;
  for (let i = 0; i < sample.length; i++) {
    rank = rank * 65536 + sample.charCodeAt(i);
  }
  return rank;
}

/**
 * Column schema for the dashboard tree table. Ported from the
 * `cols` array defined inside `renderTree()` at the original design line
 * 1958. Multi-account mode inserts the "帳戶" column between name and
 * status.
 *
 * Kept as a pure data structure (no JSX) so it can be reused from
 * the table renderer, the header, and sort handlers without pulling
 * React into this file.
 */

export type TreeColKey =
  | "no"
  | "name"
  | "account"
  | "status"
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "msg"
  | "msgcost"
  | "budget"
  | "actions";

export interface TreeCol {
  key: TreeColKey;
  label: string;
  /** Function returning the sort value for a row. Omit for non-sortable. */
  sortKey?: (entity: FbBaseEntity) => number;
}

export function buildTreeCols(multiAcct: boolean): TreeCol[] {
  const cols: TreeCol[] = [
    { key: "no", label: "No." },
    { key: "name", label: "名稱", sortKey: (i) => nameRank(i.name) },
  ];
  if (multiAcct) {
    cols.push({ key: "account", label: "帳戶" });
  }
  cols.push(
    { key: "status", label: "狀態", sortKey: (i) => statusRank(i.status) },
    { key: "spend", label: "花費", sortKey: (i) => Number(getIns(i).spend) || 0 },
    { key: "impressions", label: "曝光", sortKey: (i) => Number(getIns(i).impressions) || 0 },
    { key: "clicks", label: "點擊", sortKey: (i) => Number(getIns(i).clicks) || 0 },
    { key: "ctr", label: "CTR", sortKey: (i) => Number(getIns(i).ctr) || 0 },
    { key: "cpc", label: "CPC", sortKey: (i) => Number(getIns(i).cpc) || 0 },
    { key: "msg", label: "私訊數", sortKey: (i) => getMsgCount(i) },
    {
      key: "msgcost",
      label: "私訊成本",
      sortKey: (i) => {
        const m = getMsgCount(i);
        if (m <= 0) return Number.POSITIVE_INFINITY;
        return (Number(getIns(i).spend) || 0) / m;
      },
    },
    { key: "budget", label: "預算" },
    { key: "actions", label: "" },
  );
  return cols;
}
