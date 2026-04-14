/**
 * Build deep links into Facebook Ads Manager for a given entity.
 *
 * The legacy dashboard.html and the AlertCard view both compose
 * these URLs; centralising them here means we have ONE implementation
 * to keep in sync with FB's URL schema.
 *
 * Required: account id (with or without `act_` prefix). Optional:
 * business id — without it FB still opens the campaign but may
 * land you in the wrong Business Manager workspace.
 */

function stripActPrefix(accountId: string | undefined): string {
  if (!accountId) return "";
  return accountId.startsWith("act_") ? accountId.slice(4) : accountId;
}

/**
 * Deep link to a single campaign in the Ads Manager edit drawer.
 */
export function fbCampaignLink(
  campaignId: string,
  accountId: string | undefined,
  businessId?: string,
): string {
  const act = stripActPrefix(accountId);
  if (!act) return "";
  const bizParam = businessId ? `&business_id=${businessId}` : "";
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns/edit/standalone?act=${act}${bizParam}&selected_campaign_ids=${campaignId}&current_step=0`;
}
