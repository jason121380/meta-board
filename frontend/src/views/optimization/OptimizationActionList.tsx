import { OptimizationRow } from "./OptimizationRow";
import type { OptimizationItem } from "./optimizationData";

/**
 * Flat priority-sorted list of campaign rows. Renders one
 * OptimizationRow per item; the parent view supplies the already
 * filtered + sorted array.
 */
export function OptimizationActionList({
  items,
  businessIdForCampaign,
}: {
  items: OptimizationItem[];
  businessIdForCampaign: (accountId: string | undefined) => string | undefined;
}) {
  return (
    <div className="flex flex-col gap-2.5 md:gap-3">
      {items.map((item) => (
        <OptimizationRow
          key={item.campaign.id}
          item={item}
          businessIdForCampaign={businessIdForCampaign}
        />
      ))}
    </div>
  );
}
