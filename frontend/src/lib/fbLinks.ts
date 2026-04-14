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

/**
 * Construct a public Facebook post permalink from the creative's
 * `effective_object_story_id`, which FB returns as `{pageId}_{postId}`.
 *
 * Used by the creative preview modal so users can jump to the
 * original FB post to see the full-resolution image / video — the
 * Marketing API thumbnails are compressed front-facing previews and
 * there's no API to get the underlying asset at higher quality.
 *
 * Returns null if the input is undefined, empty, or doesn't match
 * the expected `pageId_postId` shape. Callers should use this null
 * return to decide whether to render the "在 Facebook 開啟原始貼文"
 * link at all.
 */
export function fbPostLinkFromStoryId(storyId: string | undefined): string | null {
  if (!storyId) return null;
  const underscoreAt = storyId.indexOf("_");
  if (underscoreAt <= 0 || underscoreAt === storyId.length - 1) return null;
  const pageId = storyId.slice(0, underscoreAt);
  const postId = storyId.slice(underscoreAt + 1);
  return `https://www.facebook.com/${pageId}/posts/${postId}`;
}

/**
 * Is this creative built from an existing organic FB/IG post (as
 * opposed to assets authored inside Ads Manager)?
 *
 * We detect it by the presence of `effective_object_story_id` (FB
 * post handle) or `instagram_permalink_url` (IG post direct link)
 * on the creative object. Both fields are requested from tier 1 of
 * the backend `creative{...}` field expansion in `get_ads`, so
 * they're populated for anything the API lets us read.
 *
 * Used by the Dashboard tree to show a "前台貼文" badge on rows
 * that re-use an existing post, so users can tell at a glance
 * which creatives are boosted posts vs. Ads-Manager-authored
 * assets.
 */
export function isFrontPostCreative(creative: {
  effective_object_story_id?: string;
  instagram_permalink_url?: string;
}): boolean {
  return Boolean(
    creative.effective_object_story_id || creative.instagram_permalink_url,
  );
}
