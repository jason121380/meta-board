/**
 * Frontend mirror of backend `_evaluate_alert_recommendations`
 * (main.py). Kept in sync so both the LINE flex push and the
 * in-app share report show identical guidance text.
 *
 * Inputs are pre-extracted numeric metrics so this module stays a
 * pure function — the caller is responsible for `getIns` / fallback
 * handling on FB's mixed string-or-number fields.
 */

export interface CampaignMetricsForRec {
  spend: number;
  msgs: number;
  msgCost: number;
  cpc: number;
  frequency: number;
  /** Optional FB objective. When present and traffic-oriented (e.g.
   *  OUTCOME_TRAFFIC), the rule engine skips message-based logic
   *  altogether — these campaigns aren't optimised for messages so a
   *  high msgCost is uninformative. */
  objective?: string | null;
}

const TRAFFIC_OBJECTIVES = new Set([
  "OUTCOME_TRAFFIC",
  "LINK_CLICKS",
  "OUTCOME_AWARENESS",
  "BRAND_AWARENESS",
  "REACH",
  "VIDEO_VIEWS",
  "POST_ENGAGEMENT",
  "PAGE_LIKES",
]);

/** Returns true when the campaign objective is traffic / awareness
 *  oriented — for these objectives the message metrics are noise. */
export function isTrafficObjective(objective: string | undefined | null): boolean {
  if (!objective) return false;
  return TRAFFIC_OBJECTIVES.has(objective);
}

export function buildCampaignRecommendations(m: CampaignMetricsForRec): string[] {
  const out: string[] = [];
  const trafficMode = isTrafficObjective(m.objective);
  const hasMsg = !trafficMode && m.msgs > 0;
  let skipFrequency = false;

  if (hasMsg) {
    if (m.msgCost < 100) {
      out.push(`私訊成本 $${m.msgCost.toFixed(0)} 非常好,持續以私訊轉換為主軸`);
    } else if (m.msgCost <= 200) {
      out.push(`私訊成本 $${m.msgCost.toFixed(0)} 為平均值,維持現狀即可`);
    } else if (m.msgCost <= 300) {
      out.push(`私訊成本 $${m.msgCost.toFixed(0)} 偏高,待觀察`);
    } else {
      skipFrequency = true;
      if (m.cpc <= 4) {
        out.push(
          `私訊成本 $${m.msgCost.toFixed(0)} 太高、但 CPC $${m.cpc.toFixed(2)} 表現不錯,建議檢視私訊回覆流程或落地頁轉換`,
        );
      } else {
        out.push(
          `私訊成本 $${m.msgCost.toFixed(0)} 太高、CPC $${m.cpc.toFixed(2)} 也偏高,建議從受眾與素材整體優化`,
        );
      }
    }
  } else {
    if (m.cpc > 6) {
      out.push(`CPC $${m.cpc.toFixed(2)} 太高,需要調整`);
    } else if (m.cpc > 5) {
      out.push(`CPC $${m.cpc.toFixed(2)} 可以優化`);
    } else if (m.cpc > 4) {
      out.push(`CPC $${m.cpc.toFixed(2)} 偏高,待觀察`);
    }
  }

  if (!skipFrequency) {
    if (m.frequency > 5 && m.spend > 1000) {
      out.push(`頻次 ${m.frequency.toFixed(1)} 過高,建議擴大受眾避免廣告疲勞`);
    } else if (m.frequency > 4 && m.spend > 500) {
      out.push(`頻次 ${m.frequency.toFixed(1)} 偏高,需留意素材疲勞`);
    }
  }
  return out;
}
