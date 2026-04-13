import { getIns, getMsgCount } from "@/lib/insights";
import type { FbBaseEntity } from "@/types/fb";

/**
 * Column schema for the dashboard tree table. Ported from the
 * `cols` array defined inside `renderTree()` at dashboard.html line
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
    { key: "name", label: "名稱" },
  ];
  if (multiAcct) {
    cols.push({ key: "account", label: "帳戶" });
  }
  cols.push(
    { key: "status", label: "狀態" },
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
