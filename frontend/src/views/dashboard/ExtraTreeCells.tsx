import { fM, fN } from "@/lib/format";
import {
  getAtcCount,
  getCostPerAtc,
  getCostPerLinkClick,
  getCostPerPurchase,
  getLinkClicks,
  getPurchaseCount,
  getRoas,
} from "@/lib/insights";
import type { FbBaseEntity } from "@/types/fb";
import { Fragment } from "react";
import type { TreeColKey } from "./treeCols";

/**
 * Render the optionally-visible e-commerce KPI cells in the order
 * defined by `extras`. Returns one `<td className="num">` per enabled
 * code; "—" for empty values to match the existing 私訊數 / 私訊成本
 * convention so blanks read consistently.
 */
export function ExtraTreeCells({
  entity,
  extras,
}: {
  entity: FbBaseEntity;
  extras: string[];
}) {
  return (
    <>
      {extras.map((code) => (
        <Fragment key={code}>{renderCell(code as TreeColKey, entity)}</Fragment>
      ))}
    </>
  );
}

function renderCell(code: TreeColKey, entity: FbBaseEntity) {
  switch (code) {
    case "link_clicks": {
      const v = getLinkClicks(entity);
      return <td className="num">{v > 0 ? fN(v) : "—"}</td>;
    }
    case "cost_per_link_click": {
      const v = getCostPerLinkClick(entity);
      return <td className="num">{v > 0 ? `$${fM(v)}` : "—"}</td>;
    }
    case "add_to_cart": {
      const v = getAtcCount(entity);
      return <td className="num">{v > 0 ? fN(v) : "—"}</td>;
    }
    case "cost_per_add_to_cart": {
      const v = getCostPerAtc(entity);
      return <td className="num">{v > 0 ? `$${fM(v)}` : "—"}</td>;
    }
    case "purchases": {
      const v = getPurchaseCount(entity);
      return <td className="num">{v > 0 ? fN(v) : "—"}</td>;
    }
    case "cost_per_purchase": {
      const v = getCostPerPurchase(entity);
      return <td className="num">{v > 0 ? `$${fM(v)}` : "—"}</td>;
    }
    case "roas": {
      const v = getRoas(entity);
      return <td className="num">{v > 0 ? v.toFixed(2) : "—"}</td>;
    }
    default:
      return <td className="num">—</td>;
  }
}
