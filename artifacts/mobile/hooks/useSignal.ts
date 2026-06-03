import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BinanceData } from "./useBinanceData";
import type { LiquidityData } from "./useLiquidityData";
import type { MarketStructure } from "./useMarketStructure";
import type { OrderFlowData } from "./useOrderFlow";

/* ── Types ─────────────────────────────────────────────────────────── */

export type Signal           = "LONG" | "SHORT" | "WAIT";
export type QualityCategory  = "Poor" | "Weak" | "Moderate" | "Strong" | "High Conviction";
export type SignalTimeframe   = "1m" | "5m" | "15m" | "1h" | "4h";
export type EntryQualityLabel = "Excellent" | "Good" | "Fair" | "Poor" | "Rejected";

export interface FactorScore {
  name: string;
  shortName: string;
  score: number;
  maxScore: number;
  sentiment: "bullish" | "bearish" | "neutral";
  label: string;
  reason: string;
}

export interface EntryAnalysis {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskPct: number;
  tp1Pct: number;
  tp2Pct: number;
  tp3Pct: number;
  rrLabel: string;
  isHypothetical: boolean;
  entryExplanation: string;
  expectedQuality: string;
  setupWindow: string;
}

export interface TriggerCondition {
  name: string;
  currentValue: string;
  targetValue: string;
  met: boolean;
}

export interface SetupTriggers {
  longTriggers: TriggerCondition[];
  shortTriggers: TriggerCondition[];
  longReadiness: number;
  shortReadiness: number;
  longMet: number;
  shortMet: number;
  totalConditions: number;
}

export interface SignalAnalysis {
  /* Legacy fields — preserved for all existing consumers */
  signal: Signal;
  totalScore: number;
  maxTotalScore: number;
  factors: FactorScore[];
  reasons: string[];
  reasoning: string;
  traderExplanation: string;
  qualityLabel: string;
  marketBias: string;
  setupTriggers: SetupTriggers;
  entry: EntryAnalysis | null;
  ready: boolean;
  lastUpdated: number;

  /* ── New quality-first fields ── */
  signalQualityScore: number;
  qualityCategory: QualityCategory;
  signalTimeframe: SignalTimeframe;
  entryQuality: EntryQualityLabel;
  entryRejected: boolean;
  rejectionReasons: string[];
  confirmedFactors: number;
  totalFactors: number;
  riskWarnings: string[];
  signalExplanation: string[];
}

/* ── Kline ─────────────────────────────────────────────────────────── */

interface Kline {
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  try {
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) return [];
    const raw: unknown[][] = await res.json();
    return raw.map((k) => ({
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      takerBuyVolume: parseFloat(k[9] as string),
    }));
  } catch {
    return [];
  }
}

/* ── Math helpers ───────────────────────────────────────────────────── */

function sma(vals: number[], period: number): number {
  if (!vals.length) return 0;
  const sl = vals.slice(-period);
  return sl.reduce((a, b) => a + b, 0) / sl.length;
}

function atr(klines: Kline[], period = 14): number {
  if (klines.length < period + 1) return 0;
  const r = klines.slice(-(period + 1));
  const trs = r.slice(1).map((k, i) =>
    Math.max(k.high - k.low, Math.abs(k.high - r[i].close), Math.abs(k.low - r[i].close))
  );
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/* ── Quality helpers ────────────────────────────────────────────────── */

export function getQualityLabel(pct: number): string {
  if (pct <= 20) return "Noise";
  if (pct <= 40) return "Weak Setup";
  if (pct <= 60) return "Moderate Setup";
  if (pct <= 80) return "Strong Setup";
  return "High Conviction";
}

function qualityCategory(score: number): QualityCategory {
  if (score <= 20) return "Poor";
  if (score <= 40) return "Weak";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "Strong";
  return "High Conviction";
}

/* ── Quality-weighted factor system ─────────────────────────────────── */
/*
  8 factors, weights sum to 100.
  Each factor contributes its weight when the condition is met for the evaluated direction.
*/

interface QFactor {
  name: string;
  weight: number;  // out of 100
  met: boolean;
  reason: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

function buildQualityFactors(
  isLong: boolean,
  klines15m: Kline[],
  price: number,
  data: BinanceData,
  prevOI: { oi: number; price: number } | null,
  orderFlow?: OrderFlowData,
  liquidity?: LiquidityData,
  ms?: MarketStructure,
): QFactor[] {
  const factors: QFactor[] = [];

  /* 1. Market Structure (weight 22) */
  const closes = klines15m.map((k) => k.close);
  const ma20 = sma(closes, 20);
  const maDiff = ma20 > 0 ? ((price - ma20) / ma20) * 100 : 0;
  const structMet = isLong ? maDiff > 0.12 : maDiff < -0.12;
  factors.push({
    name: "Market Structure", weight: 22,
    met: structMet,
    reason: structMet
      ? `Price ${maDiff > 0 ? "above" : "below"} 15m MA by ${Math.abs(maDiff).toFixed(2)}%`
      : `Price ${maDiff > 0 ? "above" : "below"} 15m MA — structure not ${isLong ? "bullish" : "bearish"}`,
    sentiment: maDiff > 0.12 ? "bullish" : maDiff < -0.12 ? "bearish" : "neutral",
  });

  /* 2. Volume Confirmation (weight 13) */
  const recentK = klines15m.slice(-4, -1);
  const totalVol = recentK.reduce((s, k) => s + k.volume, 0);
  const buyVol   = recentK.reduce((s, k) => s + k.takerBuyVolume, 0);
  const buyRatio = totalVol > 0 ? buyVol / totalVol : 0.5;
  const volMet   = isLong ? buyRatio > 0.54 : buyRatio < 0.46;
  factors.push({
    name: "Volume Confirmation", weight: 13,
    met: volMet,
    reason: `Taker buy: ${Math.round(buyRatio * 100)}% (need ${isLong ? ">54%" : "<46%"})`,
    sentiment: buyRatio > 0.54 ? "bullish" : buyRatio < 0.46 ? "bearish" : "neutral",
  });

  /* 3. Open Interest (weight 12) */
  let oiMet = false;
  let oiReason = "OI history building…";
  let oiSentiment: "bullish" | "bearish" | "neutral" = "neutral";
  if (prevOI?.oi && data.openInterest && prevOI.price) {
    const oiChg   = (data.openInterest - prevOI.oi) / prevOI.oi;
    const prChg   = (price - prevOI.price) / prevOI.price;
    const risingOI = oiChg > 0.001;
    const priceUp  = prChg > 0;
    oiMet = isLong ? (risingOI && priceUp) || (!risingOI && !priceUp)
                   : (risingOI && !priceUp) || (!risingOI && priceUp);
    oiSentiment = (risingOI && priceUp) ? "bullish" : (risingOI && !priceUp) ? "bearish" : "neutral";
    const chgStr = `${oiChg >= 0 ? "+" : ""}${(oiChg * 100).toFixed(2)}%`;
    oiReason = `OI ${chgStr} with price ${priceUp ? "up" : "down"} — ${oiMet ? "confirmed" : "diverging"}`;
  }
  factors.push({ name: "Open Interest", weight: 12, met: oiMet, reason: oiReason, sentiment: oiSentiment });

  /* 4. S/R Position (weight 12) */
  const recentHL = klines15m.slice(-20);
  const support    = recentHL.length ? Math.min(...recentHL.map((k) => k.low)) : 0;
  const resistance = recentHL.length ? Math.max(...recentHL.map((k) => k.high)) : 0;
  const distSupport    = support > 0 ? ((price - support) / price) * 100 : 99;
  const distResistance = resistance > 0 ? ((resistance - price) / price) * 100 : 99;
  const srMet = isLong
    ? distSupport < 1.5 && distResistance > 0.8
    : distResistance < 1.5 && distSupport > 0.8;
  const srReason = isLong
    ? `${distSupport.toFixed(2)}% above support (need <1.5%), ${distResistance.toFixed(2)}% from resistance`
    : `${distResistance.toFixed(2)}% below resistance (need <1.5%), ${distSupport.toFixed(2)}% from support`;
  factors.push({
    name: "S/R Position", weight: 12,
    met: srMet, reason: srReason,
    sentiment: distSupport < 1.5 ? "bullish" : distResistance < 1.5 ? "bearish" : "neutral",
  });

  /* 5. Order Flow — real-time WS (weight 11) */
  let ofMet = false;
  let ofReason = "Order flow loading…";
  let ofSentiment: "bullish" | "bearish" | "neutral" = "neutral";
  if (orderFlow?.ready) {
    const ofScore = orderFlow.score.score;
    ofMet = isLong ? ofScore > 55 : ofScore < 45;
    ofSentiment = ofScore > 55 ? "bullish" : ofScore < 45 ? "bearish" : "neutral";
    const aggression = isLong ? orderFlow.buyerAggression : orderFlow.sellerAggression;
    ofReason = `OF Score: ${ofScore}/100 · ${isLong ? "Buyer" : "Seller"} aggression: ${aggression}%`;
  }
  factors.push({ name: "Order Flow", weight: 11, met: ofMet, reason: ofReason, sentiment: ofSentiment });

  /* 6. Liquidity (weight 10) */
  let liqMet = false;
  let liqReason = "Liquidity loading…";
  let liqSentiment: "bullish" | "bearish" | "neutral" = "neutral";
  if (liquidity?.ready) {
    liqMet = isLong ? liquidity.liquidityBias === "Bullish" && liquidity.liquidityScore >= 56
                    : liquidity.liquidityBias === "Bearish" && liquidity.liquidityScore <= 44;
    liqSentiment = liquidity.liquidityBias === "Bullish" ? "bullish"
                 : liquidity.liquidityBias === "Bearish" ? "bearish" : "neutral";
    liqReason = `Liquidity: ${liquidity.liquidityScore}/100 · ${liquidity.liquidityBias}`;
  }
  factors.push({ name: "Liquidity", weight: 10, met: liqMet, reason: liqReason, sentiment: liqSentiment });

  /* 7. Funding Rate (weight 10) */
  const fr = data.fundingRate;
  const fundMet = isLong ? fr < 0 : fr > 0.00005;
  const frStr = `${(fr * 100).toFixed(4)}%`;
  const fundSentiment: "bullish" | "bearish" | "neutral" = fr < 0 ? "bullish" : fr > 0 ? "bearish" : "neutral";
  factors.push({
    name: "Funding Rate", weight: 10,
    met: fundMet,
    reason: `Funding: ${frStr} (${isLong ? "need <0%" : "need >0%"})`,
    sentiment: fundSentiment,
  });

  /* 8. Supply/Demand Zones (weight 10) */
  const longTF = klines15m.slice(-50);
  const supplyHigh = longTF.length ? Math.max(...longTF.slice(-30).map((k) => k.high)) : 0;
  const demandLow  = longTF.length ? Math.min(...longTF.slice(-30).map((k) => k.low)) : 0;
  const inDemand   = demandLow > 0 && price <= demandLow * 1.015;  // within 1.5% of demand low
  const inSupply   = supplyHigh > 0 && price >= supplyHigh * 0.985; // within 1.5% of supply high
  const sdMet = isLong ? inDemand : inSupply;
  const sdSentiment: "bullish" | "bearish" | "neutral" = inDemand ? "bullish" : inSupply ? "bearish" : "neutral";
  factors.push({
    name: "Supply/Demand Zone", weight: 10,
    met: sdMet,
    reason: isLong
      ? inDemand ? "Price in demand zone — favorable long entry area" : "Price not in demand zone"
      : inSupply ? "Price in supply zone — favorable short entry area" : "Price not in supply zone",
    sentiment: sdSentiment,
  });

  return factors;
}

/* ── Signal Quality Score ────────────────────────────────────────────── */

function computeQualityScore(factors: QFactor[]): number {
  return Math.round(factors.filter((f) => f.met).reduce((s, f) => s + f.weight, 0));
}

/* ── Timeframe detection from market structure ───────────────────────── */

function detectSignalTimeframe(isLong: boolean, ms?: MarketStructure): SignalTimeframe {
  if (!ms || !ms.trends.length) return "15m";
  const dir: "Bullish" | "Bearish" = isLong ? "Bullish" : "Bearish";
  const agreed = ms.trends.filter((t) => t.trend === dir).map((t) => t.tf);
  if (agreed.includes("1h")) return "1h";
  if (agreed.includes("15m")) return "15m";
  if (agreed.includes("5m")) return "5m";
  if (agreed.includes("1m")) return "1m";
  return "15m";
}

/* ── Entry quality evaluation ────────────────────────────────────────── */

function evaluateEntry(
  isLong: boolean,
  price: number,
  klines: Kline[],
  orderFlow?: OrderFlowData,
  confirmedFactors?: number,
): { quality: EntryQualityLabel; rejected: boolean; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!klines.length) return { quality: "Fair", rejected: false, reasons, warnings };

  const recent = klines.slice(-20);
  const support    = Math.min(...recent.map((k) => k.low));
  const resistance = Math.max(...recent.map((k) => k.high));
  const distSup = price > 0 ? ((price - support) / price) * 100 : 99;
  const distRes = price > 0 ? ((resistance - price) / price) * 100 : 99;

  /* Reject conditions */
  if (isLong && distRes < 0.4) {
    reasons.push("Price directly at resistance — entering into a wall");
    return { quality: "Rejected", rejected: true, reasons, warnings };
  }
  if (!isLong && distSup < 0.4) {
    reasons.push("Price directly at support — entering into a wall");
    return { quality: "Rejected", rejected: true, reasons, warnings };
  }
  if (isLong && distSup > 3.5) {
    reasons.push("Price too far from support — chasing a breakout");
    warnings.push("Late entry — elevated stop-loss risk");
    return { quality: "Rejected", rejected: true, reasons, warnings };
  }
  if (!isLong && distRes > 3.5) {
    reasons.push("Price too far from resistance — chasing a breakout");
    warnings.push("Late entry — elevated stop-loss risk");
    return { quality: "Rejected", rejected: true, reasons, warnings };
  }
  if ((confirmedFactors ?? 0) < 3) {
    reasons.push("Insufficient factor confirmation — weak signal");
    return { quality: "Rejected", rejected: true, reasons, warnings };
  }

  /* Risk warnings */
  if (isLong && distRes < 1.0) warnings.push("Resistance overhead within 1% — reduce target or skip");
  if (!isLong && distSup < 1.0) warnings.push("Support below within 1% — reduce target or skip");
  if (orderFlow && !orderFlow.ready) warnings.push("Order flow data not yet confirmed");

  /* Quality grading */
  let score = 0;
  if (isLong && distSup < 0.5) score += 30;
  else if (isLong && distSup < 1.2) score += 20;
  else score += 10;

  if (!isLong && distRes < 0.5) score += 30;
  else if (!isLong && distRes < 1.2) score += 20;
  else score += 10;

  if (orderFlow?.ready) {
    const of = isLong ? orderFlow.buyerAggression : orderFlow.sellerAggression;
    if (of > 60) score += 25;
    else if (of > 50) score += 15;
  }

  if ((confirmedFactors ?? 0) >= 6) score += 25;
  else if ((confirmedFactors ?? 0) >= 5) score += 15;
  else score += 5;

  const q: EntryQualityLabel =
    score >= 75 ? "Excellent" : score >= 55 ? "Good" : score >= 35 ? "Fair" : "Poor";
  return { quality: q, rejected: false, reasons, warnings };
}

/* ── Legacy factor system (kept for backward compat totalScore) ───────── */

function legacyFactors(klines: Kline[], data: BinanceData, prevOI: { oi: number; price: number } | null): FactorScore[] {
  const price = data.price || data.markPrice;
  const closes = klines.map((k) => k.close);
  const ma20 = sma(closes, 20);
  const maDiff = ma20 > 0 ? ((price - ma20) / ma20) * 100 : 0;

  const structScore = maDiff > 1.5 ? 15 : maDiff > 0.5 ? 10 : maDiff > 0.12 ? 5
    : maDiff < -1.5 ? -15 : maDiff < -0.5 ? -10 : maDiff < -0.12 ? -5 : 0;
  const structLabel = structScore > 10 ? "Strongly Bullish" : structScore > 0 ? "Bullish"
    : structScore < -10 ? "Strongly Bearish" : structScore < 0 ? "Bearish" : "Neutral";

  const recent = klines.slice(-4, -1);
  const tv = recent.reduce((s, k) => s + k.volume, 0);
  const bv = recent.reduce((s, k) => s + k.takerBuyVolume, 0);
  const ratio = tv > 0 ? bv / tv : 0.5;
  const volScore = ratio > 0.65 ? 10 : ratio > 0.55 ? 6 : ratio > 0.5 ? 2
    : ratio < 0.35 ? -10 : ratio < 0.45 ? -6 : ratio < 0.5 ? -2 : 0;
  const volLabel = volScore > 6 ? "Strongly Bullish" : volScore > 0 ? "Bullish"
    : volScore < -6 ? "Strongly Bearish" : volScore < 0 ? "Bearish" : "Neutral";

  const f = data.fundingRate * 100;
  const fundScore = f < -0.02 ? 5 : f < -0.005 ? 3 : f < 0 ? 1
    : f > 0.02 ? -5 : f > 0.005 ? -3 : f > 0 ? -1 : 0;
  const fundLabel = fundScore > 3 ? "Strongly Bullish" : fundScore > 0 ? "Bullish"
    : fundScore < -3 ? "Strongly Bearish" : fundScore < 0 ? "Bearish" : "Neutral";

  let oiScore = 0; let oiLabel = "Neutral"; let oiReason = "OI history building...";
  if (prevOI?.oi && data.openInterest && prevOI.price) {
    const oiC = (data.openInterest - prevOI.oi) / prevOI.oi;
    const prC = (price - prevOI.price) / prevOI.price;
    const sig = Math.abs(oiC) > 0.005;
    const oiUp = oiC > 0.001, prUp = prC > 0;
    if (oiUp && prUp)  { oiScore = sig ? 10 : 5; oiLabel = "Bullish"; oiReason = "Rising OI with price up"; }
    else if (oiUp && !prUp) { oiScore = sig ? -10 : -5; oiLabel = "Bearish"; oiReason = "Rising OI with price down"; }
    else if (!oiUp && prUp)  { oiScore = 3; oiLabel = "Mildly Bullish"; oiReason = "Falling OI with price up (shorts covering)"; }
    else { oiScore = -3; oiLabel = "Mildly Bearish"; oiReason = "Falling OI with price down (longs liquidating)"; }
  }

  return [
    { name: "Market Structure", shortName: "STRUCT", score: structScore, maxScore: 15, sentiment: structScore > 0 ? "bullish" : structScore < 0 ? "bearish" : "neutral", label: structLabel, reason: `Price ${maDiff > 0 ? "above" : "below"} 15m MA by ${Math.abs(maDiff).toFixed(2)}%` },
    { name: "Volume",           shortName: "VOLUME", score: volScore,    maxScore: 10, sentiment: volScore > 0 ? "bullish" : volScore < 0 ? "bearish" : "neutral",    label: volLabel,    reason: `Taker buy ratio: ${Math.round(ratio * 100)}%` },
    { name: "Funding Rate",     shortName: "FUNDING", score: fundScore,  maxScore: 5,  sentiment: fundScore > 0 ? "bullish" : fundScore < 0 ? "bearish" : "neutral",  label: fundLabel,   reason: `Funding rate: ${(data.fundingRate * 100).toFixed(4)}%` },
    { name: "Open Interest",    shortName: "OI",      score: oiScore,    maxScore: 10, sentiment: oiScore > 0 ? "bullish" : oiScore < 0 ? "bearish" : "neutral",      label: oiLabel,     reason: oiReason },
  ];
}

/* ── Text generators ─────────────────────────────────────────────────── */

function join(arr: string[]) {
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}

function generateReasoning(signal: Signal, factors: FactorScore[], total: number, max: number): string {
  const bull = factors.filter((f) => f.sentiment === "bullish").map((f) => f.name);
  const bear = factors.filter((f) => f.sentiment === "bearish").map((f) => f.name);
  if (signal === "LONG") {
    if (bull.length === 4) return "All four factors align to the upside. High-confluence long setup confirmed.";
    return `${join(bull)} ${bull.length > 1 ? "confirm" : "confirms"} bullish momentum.`;
  }
  if (signal === "SHORT") {
    if (bear.length === 4) return "All four factors align to the downside. High-confluence short setup confirmed.";
    return `${join(bear)} ${bear.length > 1 ? "confirm" : "confirms"} bearish momentum.`;
  }
  if (bull.length && bear.length) {
    return `Mixed signals: ${join(bear)} lean bearish while ${join(bull)} lean bullish. Alignment required.`;
  }
  const pct = Math.round((Math.abs(total) / max) * 100);
  const dir = bull.length > bear.length ? "bullish" : "bearish";
  return `Mild ${dir} lean at ${pct}% — below threshold needed for entry.`;
}

function generateTraderExplanation(signal: Signal, factors: FactorScore[], total: number, max: number): string {
  const bull = factors.filter((f) => f.sentiment === "bullish").map((f) => f.name);
  const bear = factors.filter((f) => f.sentiment === "bearish").map((f) => f.name);
  const confidence = Math.round((Math.abs(total) / max) * 100);
  const quality = getQualityLabel(confidence);
  if (signal === "LONG") {
    const lines = [`The market shows a ${quality.toLowerCase()} for a long position.`,
      bull.length === 4 ? "All four indicators are aligned to the upside, giving high confidence." : `${join(bull)} ${bull.length > 1 ? "are" : "is"} supporting a move higher.`];
    if (bear.length) lines.push(`${join(bear)} ${bear.length > 1 ? "remain" : "remains"} a mild concern but ${bear.length > 1 ? "don't" : "doesn't"} outweigh the bullish confluence.`);
    lines.push("Consider entering within the highlighted entry zone with the specified stop and targets.");
    return lines.join("\n\n");
  }
  if (signal === "SHORT") {
    const lines = [`The market shows a ${quality.toLowerCase()} for a short position.`,
      bear.length === 4 ? "All four indicators are aligned to the downside, giving high confidence." : `${join(bear)} ${bear.length > 1 ? "are" : "is"} confirming bearish momentum.`];
    if (bull.length) lines.push(`${join(bull)} shows some buying activity but not enough to prevent a short signal.`);
    lines.push("Price is likely to continue lower — look for confirmation at the entry zone before executing.");
    return lines.join("\n\n");
  }
  const lines: string[] = [];
  if (bear.length > bull.length) {
    lines.push("Weak bearish conditions — signal strength insufficient to justify a short.");
  } else if (bull.length > bear.length) {
    lines.push("Weak bullish conditions — signal strength insufficient to justify a long.");
  } else {
    lines.push("Market in equilibrium — no factor dominant enough to generate an entry.");
  }
  lines.push("Waiting for confirmation provides a better risk/reward opportunity.");
  return lines.join("\n\n");
}

function buildSignalExplanation(
  signal: Signal,
  qualityScore: number,
  qFactors: QFactor[],
  timeframe: SignalTimeframe,
  entryQual: EntryQualityLabel,
  warnings: string[],
): string[] {
  const lines: string[] = [];
  const confirmedNames = qFactors.filter((f) => f.met).map((f) => f.name);
  const failedNames    = qFactors.filter((f) => !f.met).map((f) => f.name);

  if (signal !== "WAIT") {
    lines.push(`${signal} signal detected on ${timeframe} timeframe.`);
    lines.push(`Quality Score: ${qualityScore}/100 — ${qualityCategory(qualityScore)}.`);
    if (confirmedNames.length) lines.push(`Confirmed: ${confirmedNames.join(", ")}.`);
    if (failedNames.length) lines.push(`Not confirmed: ${failedNames.join(", ")}.`);
    lines.push(`Entry Quality: ${entryQual}.`);
  } else {
    lines.push("No high-probability setup detected — WAIT is the recommended action.");
    if (failedNames.length) lines.push(`Missing: ${failedNames.slice(0, 4).join(", ")}.`);
  }

  for (const w of warnings.slice(0, 3)) lines.push(`⚠ ${w}`);
  return lines;
}

function generateSetupTriggers(
  data: BinanceData,
  klines: Kline[],
  prevOI: { oi: number; price: number } | null,
): SetupTriggers {
  const price = data.price;
  const recent = klines.length >= 11 ? klines.slice(-11, -1) : klines.slice(0, -1);
  const resistance = recent.length ? Math.max(...recent.map((k) => k.high)) : price * 1.005;
  const support    = recent.length ? Math.min(...recent.map((k) => k.low)) : price * 0.995;
  const lastC = klines.slice(-4, -1);
  const tv = lastC.reduce((s, k) => s + k.volume, 0);
  const bv = lastC.reduce((s, k) => s + k.takerBuyVolume, 0);
  const br = tv > 0 ? bv / tv : 0.5;
  const buyPct = Math.round(br * 100), sellPct = 100 - buyPct;
  const oiChg = prevOI?.oi && data.openInterest ? ((data.openInterest - prevOI.oi) / prevOI.oi) * 100 : 0;
  const fr = data.fundingRate * 100;
  const fmtP = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  const longTriggers: TriggerCondition[] = [
    { name: "Price above resistance", currentValue: fmtP(price), targetValue: fmtP(resistance), met: price > resistance },
    { name: "Taker buy volume",       currentValue: `${buyPct}%`,   targetValue: "> 55%", met: br > 0.55 },
    { name: "Open Interest rising",   currentValue: `${oiChg >= 0 ? "+" : ""}${oiChg.toFixed(1)}%`, targetValue: "> +1%", met: oiChg > 1 },
    { name: "Funding rate negative",  currentValue: `${fr >= 0 ? "+" : ""}${fr.toFixed(4)}%`, targetValue: "< 0%", met: data.fundingRate < 0 },
  ];
  const shortTriggers: TriggerCondition[] = [
    { name: "Price below support",   currentValue: fmtP(price), targetValue: fmtP(support), met: price < support },
    { name: "Taker sell volume",     currentValue: `${sellPct}%`, targetValue: "> 55%", met: br < 0.45 },
    { name: "Open Interest rising",  currentValue: `${oiChg >= 0 ? "+" : ""}${oiChg.toFixed(1)}%`, targetValue: "> +1%", met: oiChg > 1 },
    { name: "Funding rate positive", currentValue: `${fr >= 0 ? "+" : ""}${fr.toFixed(4)}%`, targetValue: "> +0.005%", met: fr > 0.005 },
  ];
  const longMet = longTriggers.filter((t) => t.met).length;
  const shortMet = shortTriggers.filter((t) => t.met).length;
  return { longTriggers, shortTriggers, longReadiness: Math.round((longMet / 4) * 100), shortReadiness: Math.round((shortMet / 4) * 100), longMet, shortMet, totalConditions: 4 };
}

function computeEntry(signal: Signal, price: number, klines: Kline[]): EntryAnalysis | null {
  if (!price) return null;
  const a = atr(klines);
  if (!a) return null;
  const slDist = a * 1.5, zoneDist = a * 0.25;
  const isLong = signal !== "SHORT", isHypo = signal === "WAIT";
  const entryLow = price - zoneDist, entryHigh = price + zoneDist;
  const sl  = isLong ? price - slDist : price + slDist;
  const tp1 = isLong ? price + a      : price - a;
  const tp2 = isLong ? price + a * 2  : price - a * 2;
  const tp3 = isLong ? price + a * 3  : price - a * 3;
  const riskPct = (Math.abs(price - sl) / price) * 100;
  const tp1Pct  = (Math.abs(tp1 - price) / price) * 100;
  const tp2Pct  = (Math.abs(tp2 - price) / price) * 100;
  const tp3Pct  = (Math.abs(tp3 - price) / price) * 100;
  const rr1 = tp1Pct / riskPct, rr2 = tp2Pct / riskPct;
  const atrPct = (a / price) * 100;
  const setupWindow = atrPct > 0.5 ? "~5–15 minutes" : atrPct > 0.25 ? "~15–45 minutes" : "~1–3 hours";
  return {
    entryLow, entryHigh, stopLoss: sl, takeProfit1: tp1, takeProfit2: tp2, takeProfit3: tp3,
    riskPct, tp1Pct, tp2Pct, tp3Pct, rrLabel: `1:${rr1.toFixed(1)} · 1:${rr2.toFixed(1)} · 1:3.0`,
    isHypothetical: isHypo, expectedQuality: qualityCategory(50), setupWindow,
    entryExplanation: `±${((zoneDist / price) * 100).toFixed(2)}% ATR buffer · SL 1.5×ATR · TP at 1×/2×/3× ATR`,
  };
}

function getMarketBias(factors: FactorScore[]): string {
  const bull = factors.filter((f) => f.sentiment === "bullish").length;
  const bear = factors.filter((f) => f.sentiment === "bearish").length;
  return bull > bear ? "Bullish" : bear > bull ? "Bearish" : "Neutral";
}

/* ── Signal computation threshold ─────────────────────────────────────── */
/*
  Quality score thresholds (out of 100):
  - HIGH CONVICTION signal: >= 68 and >= 6 confirmed factors
  - STRONG signal:          >= 52 and >= 5 confirmed factors
  - Minimum signal:         >= 42 and >= 4 confirmed factors
  - Otherwise: WAIT
*/
const MIN_QUALITY   = 42;
const MIN_CONFIRMED = 4;

/* ── Empty state ─────────────────────────────────────────────────────── */

const EMPTY: SignalAnalysis = {
  signal: "WAIT", totalScore: 0, maxTotalScore: 40,
  factors: [], reasons: [], reasoning: "", traderExplanation: "",
  qualityLabel: "Noise", marketBias: "Neutral",
  setupTriggers: { longTriggers: [], shortTriggers: [], longReadiness: 0, shortReadiness: 0, longMet: 0, shortMet: 0, totalConditions: 4 },
  entry: null, ready: false, lastUpdated: 0,
  signalQualityScore: 0,
  qualityCategory: "Poor",
  signalTimeframe: "15m",
  entryQuality: "Fair",
  entryRejected: false,
  rejectionReasons: [],
  confirmedFactors: 0,
  totalFactors: 8,
  riskWarnings: [],
  signalExplanation: [],
};

/* ── Hook ────────────────────────────────────────────────────────────── */

interface SignalExtras {
  orderFlow?: OrderFlowData;
  liquidity?: LiquidityData;
  ms?: MarketStructure;
}

export function useSignalAnalysis(
  data: BinanceData,
  symbol: string = "BTCUSDT",
  extras?: SignalExtras,
): SignalAnalysis {
  const [analysis, setAnalysis] = useState<SignalAnalysis>(EMPTY);
  const oiHistory    = useRef<{ oi: number; price: number }[]>([]);
  const klines15mRef = useRef<Kline[]>([]);
  const extrasRef    = useRef<SignalExtras>({});
  extrasRef.current  = extras ?? {};

  const computeAndSet = useCallback((klines: Kline[]) => {
    const hist = oiHistory.current;
    const prev  = hist.length >= 2 ? hist[hist.length - 2] : { oi: 0, price: 0 };
    const price = data.price || data.markPrice;
    const { orderFlow, liquidity, ms } = extrasRef.current;

    /* ── Legacy 4-factor system (for totalScore backward compat) ── */
    const lFactors = legacyFactors(klines, data, prev);
    const totalScore = lFactors.reduce((s, f) => s + f.score, 0);
    const maxTotalScore = 40;

    /* ── Determine candidate direction from legacy score ── */
    const legacyLong  = totalScore >= maxTotalScore * 0.25;
    const legacyShort = totalScore <= -maxTotalScore * 0.25;
    const evalLong    = legacyLong ? true : legacyShort ? false : totalScore >= 0;

    /* Compute quality factors for both directions to pick best */
    const longQF  = buildQualityFactors(true,  klines, price, data, prev, orderFlow, liquidity, ms);
    const shortQF = buildQualityFactors(false, klines, price, data, prev, orderFlow, liquidity, ms);
    const longScore  = computeQualityScore(longQF);
    const shortScore = computeQualityScore(shortQF);

    /* Pick the direction with the highest quality score */
    let finalQF: QFactor[];
    let isLong: boolean;
    if (longScore >= shortScore) {
      finalQF = longQF; isLong = true;
    } else {
      finalQF = shortQF; isLong = false;
    }

    const qualScore = isLong ? longScore : shortScore;
    const confirmedN = finalQF.filter((f) => f.met).length;

    /* ── Signal decision ── */
    let signal: Signal = "WAIT";
    if (qualScore >= MIN_QUALITY && confirmedN >= MIN_CONFIRMED) {
      signal = isLong ? "LONG" : "SHORT";
    }
    // Double-check: if legacy strongly disagrees, stay WAIT
    if (signal === "LONG"  && totalScore <= -maxTotalScore * 0.15) signal = "WAIT";
    if (signal === "SHORT" && totalScore >= maxTotalScore * 0.15)  signal = "WAIT";

    /* ── Entry quality ── */
    const entryEval = evaluateEntry(isLong, price, klines, orderFlow, confirmedN);
    if (entryEval.rejected && signal !== "WAIT") signal = "WAIT";

    /* ── Timeframe detection ── */
    const tf = detectSignalTimeframe(signal === "LONG" || (signal === "WAIT" && isLong), ms);

    /* ── Build legacy factors (shortName-keyed for probability engine) ── */
    const confidence = Math.round((Math.abs(totalScore) / maxTotalScore) * 100);
    const reasons    = lFactors.filter((f) => f.sentiment !== "neutral").map((f) => f.reason);

    /* ── Text ── */
    const reasoning          = generateReasoning(signal, lFactors, totalScore, maxTotalScore);
    const traderExplanation  = generateTraderExplanation(signal, lFactors, totalScore, maxTotalScore);
    const setupTriggers      = generateSetupTriggers(data, klines, prev);
    const entry              = computeEntry(signal, price, klines);

    /* ── Signal explanation bullets ── */
    const signalExplanation = buildSignalExplanation(
      signal, qualScore, finalQF, tf, entryEval.quality, entryEval.warnings
    );

    setAnalysis({
      signal, totalScore, maxTotalScore,
      factors: lFactors, reasons, reasoning, traderExplanation,
      qualityLabel: getQualityLabel(confidence),
      marketBias: getMarketBias(lFactors),
      setupTriggers, entry,
      ready: price > 0, lastUpdated: Date.now(),
      signalQualityScore: qualScore,
      qualityCategory: qualityCategory(qualScore),
      signalTimeframe: tf,
      entryQuality: entryEval.quality,
      entryRejected: entryEval.rejected,
      rejectionReasons: entryEval.reasons,
      confirmedFactors: confirmedN,
      totalFactors: 8,
      riskWarnings: entryEval.warnings,
      signalExplanation,
    });
  }, [data]);

  useEffect(() => {
    if (data.openInterest > 0 && data.price > 0) {
      const hist = oiHistory.current;
      const last  = hist[hist.length - 1];
      if (!last || last.oi !== data.openInterest) {
        oiHistory.current = [...hist.slice(-9), { oi: data.openInterest, price: data.price }];
      }
    }
    if (data.price > 0) computeAndSet(klines15mRef.current);
  }, [data, computeAndSet]);

  /* Re-run when extras update (order flow / liquidity ready) */
  const ofReady  = extras?.orderFlow?.ready;
  const liqReady = extras?.liquidity?.ready;
  const ofScore  = extras?.orderFlow?.score.score;
  const liqScore = extras?.liquidity?.liquidityScore;
  useEffect(() => {
    if (data.price > 0 && klines15mRef.current.length > 0) computeAndSet(klines15mRef.current);
  }, [ofReady, liqReady, ofScore, liqScore, computeAndSet, data.price]);

  useEffect(() => {
    const run = async () => {
      const klines = await fetchKlines(symbol, "15m", 55);
      if (klines.length > 0) { klines15mRef.current = klines; computeAndSet(klines); }
    };
    run();
    const timer = setInterval(run, 30_000);
    return () => clearInterval(timer);
  }, [symbol, computeAndSet]);

  /* Memoize extras deps to avoid re-render loops */
  const memoExtras = useMemo(() => extras, [
    extras?.orderFlow?.ready, extras?.orderFlow?.score.score,
    extras?.liquidity?.ready, extras?.liquidity?.liquidityScore,
    extras?.ms?.lastUpdated,
  ]);
  void memoExtras; // consumed via extrasRef

  return analysis;
}
