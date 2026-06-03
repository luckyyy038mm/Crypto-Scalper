import { useMemo } from "react";

import type { BinanceData } from "./useBinanceData";
import type { LiquidityData } from "./useLiquidityData";
import type { MarketStructure } from "./useMarketStructure";
import type { OrderFlowData } from "./useOrderFlow";
import type { SignalAnalysis } from "./useSignal";
import type { SignalEntry } from "./useSignalHistory";

/* ── Types ─────────────────────────────────────────────────────── */

export type RiskLevel   = "Low" | "Medium" | "High";
export type ProbHoldTime =
  | "Scalp (1–15 min)"
  | "Short Term (15–60 min)"
  | "Intraday (1–4 hours)";
export type ProbQuality =
  | "Noise"
  | "Weak"
  | "Moderate"
  | "Strong"
  | "High Conviction";

export interface ProbabilityCondition {
  name: string;
  met: boolean;
  weight: number;   // each condition's max contribution (all sum to 100)
  detail: string;   // human-readable current value / gap
}

export interface ProbabilityResult {
  probability: number;           // 0-100
  riskLevel: RiskLevel;
  setupQuality: ProbQuality;
  holdTime: ProbHoldTime;
  confluenceScore: number;       // # conditions met
  totalConditions: number;       // always 9
  conditions: ProbabilityCondition[];
  readiness: number;             // 0-100%
  explanation: string[];         // bullet-point reasons
  direction: "LONG" | "SHORT" | "WAIT";
  ready: boolean;
}

/* ── Core computation ──────────────────────────────────────────── */

function compute(
  analysis: SignalAnalysis,
  ms: MarketStructure,
  data: BinanceData,
  orderFlow: OrderFlowData,
  history: SignalEntry[],
  liquidity?: LiquidityData,
): ProbabilityResult {
  const { signal, factors } = analysis;

  /* Determine the direction being evaluated.
   * For WAIT we look at marketBias to pick the dominant side,
   * but the final label stays "WAIT" and gets a probability discount. */
  const evalDir: "LONG" | "SHORT" =
    signal === "LONG"  ? "LONG"  :
    signal === "SHORT" ? "SHORT" :
    analysis.marketBias === "Bullish" ? "LONG" : "SHORT";
  const isLong = evalDir === "LONG";

  /* Factor lookups -------------------------------------------------- */
  const structF = factors.find((f) => f.shortName === "STRUCT");
  const oiF     = factors.find((f) => f.shortName === "OI");

  /* ── 8 conditions ─────────────────────────────────────────────── */

  /* 1. Market Structure (weight 22) */
  const struct1Met = isLong
    ? structF?.sentiment === "bullish"
    : structF?.sentiment === "bearish";
  const struct1Detail = structF
    ? `${structF.label} — ${structF.reason}`
    : "Insufficient structure data";

  /* 2. Volume Confirmation (weight 15) */
  /* prefer order-flow buyerAggression; fall back to volume factor */
  const buyRatio = orderFlow.ready
    ? orderFlow.buyerAggression / 100
    : factors.find((f) => f.shortName === "VOLUME")?.sentiment === "bullish" ? 0.6 : 0.4;
  const volMet = isLong ? buyRatio > 0.55 : buyRatio < 0.45;
  const volDetail = isLong
    ? `Buy vol: ${Math.round(buyRatio * 100)}% (need >55%)`
    : `Sell vol: ${Math.round((1 - buyRatio) * 100)}% (need >55%)`;

  /* 3. Funding Rate (weight 10) */
  const fr = data.fundingRate;
  const fundMet = isLong ? fr < 0 : fr > 0.00005;
  const frStr = `${(fr * 100).toFixed(4)}%`;
  const fundDetail = `Funding: ${frStr} — ${isLong ? "need <0% (shorts paying)" : "need >0% (longs paying)"}`;

  /* 4. Open Interest Trend (weight 15) */
  const oiMet = isLong
    ? oiF?.sentiment === "bullish"
    : oiF?.sentiment === "bearish";
  const oiDetail = oiF
    ? `${oiF.label} — ${oiF.reason}`
    : "OI history still building";

  /* 5. Momentum (weight 10) */
  const momMet = isLong ? ms.momentumScore > 2 : ms.momentumScore < -2;
  const momStr = ms.momentumScore >= 0 ? `+${ms.momentumScore}` : `${ms.momentumScore}`;
  const momDetail = `Momentum: ${momStr} (${isLong ? "need >+2" : "need <-2"})`;

  /* 6. S/R Position (weight 10)
   * LONG: price within 1.5% above support → good entry risk/reward
   * SHORT: price within 1.5% below resistance → good entry risk/reward */
  const srMet = isLong
    ? ms.supportPct >= 0 && ms.supportPct < 1.5
    : ms.resistancePct >= 0 && ms.resistancePct < 1.5;
  const srDetail = isLong
    ? ms.support > 0
      ? `${ms.supportPct.toFixed(2)}% above support $${Math.round(ms.support).toLocaleString()} (need <1.5%)`
      : "S/R data loading"
    : ms.resistance > 0
      ? `${ms.resistancePct.toFixed(2)}% below resistance $${Math.round(ms.resistance).toLocaleString()} (need <1.5%)`
      : "S/R data loading";

  /* 7. Order Flow (weight 10) */
  const ofAgg = isLong ? orderFlow.buyerAggression : orderFlow.sellerAggression;
  const ofMet = orderFlow.ready && ofAgg > 55;
  const ofDetail = orderFlow.ready
    ? `${isLong ? "Buyer" : "Seller"} aggression: ${ofAgg}% (need >55%)`
    : "Order flow loading…";

  /* 8. Signal History (weight 8) */
  const recent = history.slice(0, 5);
  const histMatch = recent.filter((h) => h.signal === evalDir).length;
  const histMet = recent.length >= 2 && histMatch >= Math.ceil(recent.length / 2);
  const histDetail =
    recent.length < 2
      ? "Building signal history…"
      : `${histMatch} of last ${recent.length} signals are ${evalDir}`;

  /* 9. Liquidity Score (weight 8) */
  const liqScore = liquidity?.liquidityScore ?? 50;
  const liqBias  = liquidity?.liquidityBias ?? "Neutral";
  const liqMet   = liquidity?.ready
    ? (isLong ? liqBias === "Bullish" && liqScore >= 58 : liqBias === "Bearish" && liqScore <= 42)
    : false;
  const liqDetail = liquidity?.ready
    ? `Liquidity score: ${liqScore}/100 — ${liqBias} (${isLong ? "need ≥58 Bullish" : "need ≤42 Bearish"})`
    : "Liquidity data loading…";

  /* ── Assemble conditions (weights sum to 100) ───────────────────── */
  const conditions: ProbabilityCondition[] = [
    { name: "Market Structure",    met: struct1Met, weight: 18, detail: struct1Detail },
    { name: "Volume Confirmation", met: volMet,     weight: 13, detail: volDetail },
    { name: "Funding Rate",        met: fundMet,    weight: 10, detail: fundDetail },
    { name: "Open Interest Trend", met: oiMet,      weight: 13, detail: oiDetail },
    { name: "Momentum",            met: momMet,     weight: 10, detail: momDetail },
    { name: "S/R Position",        met: srMet,      weight: 10, detail: srDetail },
    { name: "Order Flow",          met: ofMet,      weight: 10, detail: ofDetail },
    { name: "Signal History",      met: histMet,    weight: 8,  detail: histDetail },
    { name: "Liquidity Score",     met: liqMet,     weight: 8,  detail: liqDetail },
  ];

  const confluenceScore   = conditions.filter((c) => c.met).length;
  const totalConditions   = conditions.length;
  const weightedMet       = conditions.filter((c) => c.met).reduce((s, c) => s + c.weight, 0);
  const weightedTotal     = conditions.reduce((s, c) => s + c.weight, 0); // = 100

  /* Map weighted score to 15-87% (trading is never 100% certain) */
  let probability = Math.round(15 + (weightedMet / weightedTotal) * 72);
  /* WAIT → directional uncertainty discount */
  if (signal === "WAIT") probability = Math.round(probability * 0.75);
  probability = Math.min(87, Math.max(15, probability));

  /* ── Derived fields ────────────────────────────────────────────── */
  const riskLevel: RiskLevel =
    probability >= 62 ? "Low" :
    probability >= 42 ? "Medium" : "High";

  const setupQuality: ProbQuality =
    probability >= 72 ? "High Conviction" :
    probability >= 58 ? "Strong"          :
    probability >= 44 ? "Moderate"        :
    probability >= 30 ? "Weak"            : "Noise";

  const absMom = Math.abs(ms.momentumScore);
  const holdTime: ProbHoldTime =
    absMom > 8 && confluenceScore >= 5  ? "Scalp (1–15 min)"         :
    confluenceScore >= 4 || absMom > 3  ? "Short Term (15–60 min)"   :
                                          "Intraday (1–4 hours)";

  const readiness = Math.round((confluenceScore / totalConditions) * 100);

  /* ── Explanation bullets ───────────────────────────────────────── */
  const explanation: string[] = [];
  if (struct1Met)  explanation.push(`${isLong ? "Bullish" : "Bearish"} market structure confirmed`);
  else             explanation.push(`Market structure not yet ${isLong ? "bullish" : "bearish"} — trend alignment missing`);
  if (oiMet)       explanation.push(`OI ${isLong ? "rising with price (trend continuation)" : "rising as price falls (bearish pressure)"}`);
  if (volMet)      explanation.push(`Volume confirmation present — ${isLong ? "buyers" : "sellers"} dominating`);
  if (srMet)       explanation.push(`Price near ${isLong ? "support" : "resistance"} — favorable entry risk/reward`);
  if (momMet)      explanation.push(`${isLong ? "Positive" : "Negative"} momentum supports continuation`);
  if (fundMet)     explanation.push(`Funding rate ${fr < 0 ? "negative (shorts paying longs)" : "positive (longs paying shorts)"}`);
  if (!volMet)     explanation.push(`${isLong ? "Buy" : "Sell"} pressure below threshold — awaiting volume confirmation`);
  if (!struct1Met) explanation.push("Waiting for structural alignment before entering");
  if (!oiMet)      explanation.push("OI not yet confirming directional conviction");
  if (liqMet)            explanation.push(`Liquidity ${isLong ? "bid walls supporting" : "ask walls confirming"} directional bias`);
  if (!liqMet && liquidity?.ready) explanation.push("Liquidity conditions not yet confirming directional bias");
  if (signal === "WAIT") explanation.push("No active signal — probability discounted for directional uncertainty");

  return {
    probability,
    riskLevel,
    setupQuality,
    holdTime,
    confluenceScore,
    totalConditions,
    conditions,
    readiness,
    explanation: explanation.slice(0, 6),
    direction: signal,
    ready: data.price > 0 && ms.lastUpdated > 0,
  };
}

/* ── Hook ──────────────────────────────────────────────────────── */

const EMPTY: ProbabilityResult = {
  probability: 0,
  riskLevel: "High",
  setupQuality: "Noise",
  holdTime: "Intraday (1–4 hours)",
  confluenceScore: 0,
  totalConditions: 9,
  conditions: [],
  readiness: 0,
  explanation: [],
  direction: "WAIT",
  ready: false,
};

export function useProbabilityEngine(
  analysis: SignalAnalysis,
  ms: MarketStructure,
  data: BinanceData,
  orderFlow: OrderFlowData,
  history: SignalEntry[],
  liquidity?: LiquidityData,
): ProbabilityResult {
  return useMemo(
    () => (data.price > 0 ? compute(analysis, ms, data, orderFlow, history, liquidity) : EMPTY),
    [analysis, ms, data, orderFlow, history, liquidity],
  );
}
