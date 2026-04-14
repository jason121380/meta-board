import { cn } from "@/lib/cn";
import { fbCampaignLink } from "@/lib/fbLinks";

/**
 * Small ↗ icon link that opens a campaign in Facebook Ads Manager
 * in a new tab. Same visual + behavior as the link inside
 * AlertCard rows so users get a consistent affordance everywhere
 * a campaign id is visible (dashboard tree, finance table, alerts).
 *
 * Renders nothing when we can't build a valid URL (missing
 * accountId), so call sites can drop it into row layouts without
 * defensive null-checks.
 */
export interface FbCampaignLinkProps {
  campaignId: string;
  accountId: string | undefined;
  /** Campaign name — used for the screen-reader / hover label. */
  campaignName: string;
  businessId?: string;
  className?: string;
}

export function FbCampaignLink({
  campaignId,
  accountId,
  campaignName,
  businessId,
  className,
}: FbCampaignLinkProps) {
  const href = fbCampaignLink(campaignId, accountId, businessId);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="在 Facebook 廣告管理員開啟"
      aria-label={`在 Facebook 廣告管理員開啟 ${campaignName}`}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300",
        "hover:bg-orange-bg hover:text-orange active:bg-orange-bg active:text-orange",
        className,
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      <span className="sr-only">在 Facebook 廣告管理員開啟</span>
    </a>
  );
}
