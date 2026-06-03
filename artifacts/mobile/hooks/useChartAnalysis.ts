import { useMemo } from "react";

import type { Candle } from "./useKlineData";

/* ── Public types ─────────────────────────────────────────────────── */

export type TrendDir      = "Bullish" | "Bearish" | "Sideways";
export type TrendStrength = "Weak" | "Moderate" | "Strong";
export type StructureType = "Bullish" | "Bearish" | "Neutral";
export type ZoneStrength  = "Weak" | "Moderate" | "Strong";
export type PatternBias   = "Bullish" | "Bearish" | "Neutral";
export type ForecastScenario =
  | "Bullish Continuation"
  | "Bearish Continuation"
  | "Pullback"
  | "Reversal"
  | "Breakout"
  | "Range";

export interface AnalysisLevel {
  price: number;
  strength: number;
  strengthLabel: ZoneStrength;
  type: "support" | "resistance";
  distancePct: number;
}

export interface AnalysisZone {
  top: number;
  bottom: number;
  midpoint: number;
  type: "supply" | "demand";
  strength: ZoneStrength;
  widthPct: number;
  valid: boolean;
  distancePct: number;
}

export interface StructurePoint {
  kind: "HH" | "HL" | "LH" | "LL";
  price: number;
  index: number;
}

export interface PatternResult {
  name: string;
  bias: PatternBias;
  confidence: number;
  description: string;
  target?: number;
}

export interface TradeZone {
  direction: "LONG" | "SHORT";
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  quality: "A+" | "A" | "B" | "C";
  confidence: number;
  reasoning: string;
}

export interface TrendAnalysis {
  direction: TrendDir;
  strength: TrendStrength;
  durationCandles: number;
  alignedTimeframes: number;
  ema20: number;
  ema50: number;
}

export interface StructureAnalysis {
  structure: StructureType;
  higherHighs: number;
  higherLows: number;
  lowerHighs: number;
  lowerLows: number;
  recentPoints: StructurePoint[];
  breakLevel: number;
}

export interface MarketForecast {
  bullishContinuation: number;
  bearishContinuation: number;
  pullback: number;
  reversal: number;
  breakout: number;
  range: number;
  topScenario: ForecastScenario;
  topProbability: number;
  explanation: string;
}

export interface ChartAnalysisSummary {
  coin: string;
  interval: string;
  trend: TrendDir;
  structure: StructureType;
  nearestDemand: number;
  nearestSupply: number;
  bestSetup: string;
  confidence: number;
  bias: PatternBias;
}

export interface ChartAnalysis {
  currentPrice: number;
  atr: number;
  trend: TrendAnalysis;
  structure: StructureAnalysis;
  supportLevels: AnalysisLevel[];
  resistanceLevels: AnalysisLevel[];
  supplyZones: AnalysisZone[];
  demandZones: AnalysisZone[];
  patterns: PatternResult[];
  longZone: TradeZone | null;
  shortZone: TradeZone | null;
  summary: ChartAnalysisSummary;
  forecast: MarketForecast;
  analystText: string;
  whyThisTrade: string;
  _future: {
    orderFlowOverlay: null;
    liquidityOverlay: null;
    footprintAnalysis: null;
    volumeProfile: null;
    cvd: null;
    liquidationClusters: null;
  };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-period - 1);
  let sum = 0;
  for (let i = 1; i < slice.length; i++) {
    const c = slice[i], p = slice[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / (slice.length - 1);
}

interface SwingPt { price: number; index: number }

function swingHighs(candles: Candle[], lookback = 3): SwingPt[] {
  const pts: SwingPt[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    let ok = true;
    for (let j = i - lookback; j <= i + lookback && ok; j++) {
      if (j !== i && candles[j].high >= h) ok = false;
    }
    if (ok) pts.push({ price: h, index: i });
  }
  return pts;
}

function swingLows(candles: Candle[], lookback = 3): SwingPt[] {
  const pts: SwingPt[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low;
    let ok = true;
    for (let j = i - lookback; j <= i + lookback && ok; j++) {
      if (j !== i && candles[j].low <= l) ok = false;
    }
    if (ok) pts.push({ price: l, index: i });
  }
  return pts;
}

function cluster(prices: number[], proximityPct: number, type: "support" | "resistance"): { price: number; count: number; type: typeof type }[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = groups[groups.length - 1];
    const avg = last.reduce((a, b) => a + b, 0) / last.length;
    if (Math.abs(sorted[i] - avg) / avg * 100 < proximityPct) last.push(sorted[i]);
    else groups.push([sorted[i]]);
  }
  return groups.map((g) => ({ price: g.reduce((a, b) => a + b, 0) / g.length, count: g.length, type }))
    .sort((a, b) => b.count - a.count).slice(0, 6);
}

function strengthLabel(count: number): ZoneStrength {
  if (count >= 3) return "Strong";
  if (count >= 2) return "Moderate";
  return "Weak";
}

/* ── Trend Analysis ───────────────────────────────────────────────── */

function computeTrend(candles: Candle[], currentPrice: number): TrendAnalysis {
  if (candles.length < 20) {
    return { direction: "Sideways", strength: "Weak", durationCandles: 0, alignedTimeframes: 0, ema20: currentPrice, ema50: currentPrice };
  }
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes.slice(0, Math.max(50, closes.length)), 50);
  const e20Arr = closes.slice(-30);
  const e20Slope = e20Arr.length >= 5 ? (e20Arr[e20Arr.length - 1] - e20Arr[e20Arr.length - 5]) / e20Arr[e20Arr.length - 5] * 100 : 0;
  const priceVsE20 = (currentPrice - e20) / e20 * 100;
  const e20VsE50  = (e20 - e50) / e50 * 100;

  let direction: TrendDir;
  if (priceVsE20 > 0.15 && e20VsE50 > 0.1 && e20Slope > 0.05) direction = "Bullish";
  else if (priceVsE20 < -0.15 && e20VsE50 < -0.1 && e20Slope < -0.05) direction = "Bearish";
  else direction = "Sideways";

  const absSlope = Math.abs(e20Slope);
  const strength: TrendStrength = absSlope > 0.2 ? "Strong" : absSlope > 0.08 ? "Moderate" : "Weak";

  let dur = 0;
  const threshold = direction === "Bullish" ? 1 : -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    const side = candles[i].close >= e20 ? 1 : -1;
    if (side === threshold) dur++;
    else break;
  }

  return { direction, strength, durationCandles: dur, alignedTimeframes: 0, ema20: e20, ema50: e50 };
}

/* ── Market Structure ─────────────────────────────────────────────── */

function computeStructure(highs: SwingPt[], lows: SwingPt[], currentPrice: number): StructureAnalysis {
  const recentHighs = highs.slice(-5);
  const recentLows  = lows.slice(-5);

  let hh = 0, hl = 0, lh = 0, ll = 0;
  const recentPoints: StructurePoint[] = [];

  for (let i = 1; i < recentHighs.length; i++) {
    const kind: "HH" | "LH" = recentHighs[i].price > recentHighs[i - 1].price ? "HH" : "LH";
    if (kind === "HH") hh++; else lh++;
    recentPoints.push({ kind, price: recentHighs[i].price, index: recentHighs[i].index });
  }
  for (let i = 1; i < recentLows.length; i++) {
    const kind: "HL" | "LL" = recentLows[i].price > recentLows[i - 1].price ? "HL" : "LL";
    if (kind === "HL") hl++; else ll++;
    recentPoints.push({ kind, price: recentLows[i].price, index: recentLows[i].index });
  }

  recentPoints.sort((a, b) => a.index - b.index);

  let structure: StructureType;
  if (hh + hl > lh + ll && hh + hl >= 2) structure = "Bullish";
  else if (lh + ll > hh + hl && lh + ll >= 2) structure = "Bearish";
  else structure = "Neutral";

  const breakLevel = structure === "Bullish"
    ? (recentHighs[recentHighs.length - 1]?.price ?? currentPrice)
    : (recentLows[recentLows.length - 1]?.price ?? currentPrice);

  return { structure, higherHighs: hh, higherLows: hl, lowerHighs: lh, lowerLows: ll, recentPoints, breakLevel };
}

/* ── Pattern Detection ────────────────────────────────────────────── */

function detectPatterns(candles: Candle[], highs: SwingPt[], lows: SwingPt[], atrVal: number, currentPrice: number): PatternResult[] {
  const results: PatternResult[] = [];
  if (candles.length < 20) return results;

  const recentHighs = highs.slice(-4);
  const recentLows  = lows.slice(-4);
  const last20      = candles.slice(-20);
  const last10      = candles.slice(-10);

  if (recentHighs.length >= 2) {
    const h1 = recentHighs[recentHighs.length - 2];
    const h2 = recentHighs[recentHighs.length - 1];
    const diff = Math.abs(h1.price - h2.price) / Math.max(h1.price, h2.price) * 100;
    if (diff < 0.6 && h2.index > h1.index + 3) {
      results.push({
        name: "Double Top", bias: "Bearish",
        confidence: Math.round(Math.max(40, 80 - diff * 40)),
        description: `Two equal highs near $${h2.price.toFixed(0)} — bearish reversal signal.`,
        target: currentPrice - (h2.price - currentPrice) * 1.5,
      });
    }
  }

  if (recentLows.length >= 2) {
    const l1 = recentLows[recentLows.length - 2];
    const l2 = recentLows[recentLows.length - 1];
    const diff = Math.abs(l1.price - l2.price) / Math.min(l1.price, l2.price) * 100;
    if (diff < 0.6 && l2.index > l1.index + 3) {
      results.push({
        name: "Double Bottom", bias: "Bullish",
        confidence: Math.round(Math.max(40, 80 - diff * 40)),
        description: `Two equal lows near $${l2.price.toFixed(0)} — bullish reversal signal.`,
        target: currentPrice + (currentPrice - l2.price) * 1.5,
      });
    }
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const highDiff = Math.abs(recentHighs[recentHighs.length - 1].price - recentHighs[recentHighs.length - 2].price)
      / recentHighs[recentHighs.length - 1].price * 100;
    const lowsRising = recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;
    if (highDiff < 0.5 && lowsRising) {
      results.push({
        name: "Ascending Triangle", bias: "Bullish",
        confidence: Math.round(60 + Math.min(20, (0.5 - highDiff) * 40)),
        description: `Flat resistance + rising support — bullish breakout setup.`,
        target: recentHighs[recentHighs.length - 1].price + (recentHighs[recentHighs.length - 1].price - recentLows[recentLows.length - 1].price),
      });
    }
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const lowDiff = Math.abs(recentLows[recentLows.length - 1].price - recentLows[recentLows.length - 2].price)
      / recentLows[recentLows.length - 1].price * 100;
    const highsFalling = recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
    if (lowDiff < 0.5 && highsFalling) {
      results.push({
        name: "Descending Triangle", bias: "Bearish",
        confidence: Math.round(60 + Math.min(20, (0.5 - lowDiff) * 40)),
        description: `Flat support + falling resistance — bearish breakdown setup.`,
        target: recentLows[recentLows.length - 1].price - (recentHighs[recentHighs.length - 1].price - recentLows[recentLows.length - 1].price),
      });
    }
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const highsFalling = recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
    const lowsRising2  = recentLows[recentLows.length - 1].price  > recentLows[recentLows.length - 2].price;
    if (highsFalling && lowsRising2) {
      const compression = Math.abs(recentHighs[recentHighs.length - 1].price - recentLows[recentLows.length - 1].price)
        / currentPrice * 100;
      if (compression < 3) {
        results.push({
          name: "Symmetrical Triangle", bias: "Neutral",
          confidence: Math.round(55 + Math.min(20, (3 - compression) * 8)),
          description: `Converging highs and lows — breakout direction pending confirmation.`,
        });
      }
    }
  }

  if (last20.length >= 15) {
    const impulse = (last20[9].close - last20[0].close) / last20[0].close * 100;
    const consol  = (last20[last20.length - 1].close - last20[9].close) / last20[9].close * 100;
    if (impulse > 2.5 && consol > -2 && consol < 0.5) {
      const flagTight = Math.max(...last10.map((c) => c.high)) - Math.min(...last10.map((c) => c.low));
      if (flagTight / currentPrice * 100 < 2) {
        results.push({
          name: "Bull Flag", bias: "Bullish",
          confidence: Math.round(Math.min(85, 55 + impulse * 3)),
          description: `Strong ${impulse.toFixed(1)}% impulse + tight consolidation — continuation likely.`,
          target: currentPrice + (last20[9].close - last20[0].close),
        });
      }
    }
  }

  if (last20.length >= 15) {
    const impulse = (last20[9].close - last20[0].close) / last20[0].close * 100;
    const consol  = (last20[last20.length - 1].close - last20[9].close) / last20[9].close * 100;
    if (impulse < -2.5 && consol < 2 && consol > -0.5) {
      const flagTight = Math.max(...last10.map((c) => c.high)) - Math.min(...last10.map((c) => c.low));
      if (flagTight / currentPrice * 100 < 2) {
        results.push({
          name: "Bear Flag", bias: "Bearish",
          confidence: Math.round(Math.min(85, 55 + Math.abs(impulse) * 3)),
          description: `Strong ${Math.abs(impulse).toFixed(1)}% drop + tight bounce — continuation lower likely.`,
          target: currentPrice + (last20[9].close - last20[0].close),
        });
      }
    }
  }

  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const rangeHigh = Math.max(...recentHighs.map((h) => h.price));
    const rangeLow  = Math.min(...recentLows.map((l) => l.price));
    const rangePct  = (rangeHigh - rangeLow) / rangeLow * 100;
    if (rangePct < 3 && Math.abs(currentPrice - (rangeHigh + rangeLow) / 2) / currentPrice * 100 < 1.5) {
      results.push({
        name: "Range", bias: "Neutral",
        confidence: Math.round(60 + Math.min(20, (3 - rangePct) * 8)),
        description: `Price consolidating in a ${rangePct.toFixed(1)}% range — awaiting directional break.`,
      });
    }
  }

  if (recentHighs.length >= 1) {
    const prevHigh = recentHighs[recentHighs.length - 1].price;
    if (currentPrice > prevHigh && (currentPrice - prevHigh) / prevHigh * 100 < 2) {
      results.push({
        name: "Breakout Structure", bias: "Bullish", confidence: 65,
        description: `Price broke above recent high at $${prevHigh.toFixed(0)} — bullish continuation.`,
        target: currentPrice + atrVal * 2,
      });
    }
  }
  if (recentLows.length >= 1) {
    const prevLow = recentLows[recentLows.length - 1].price;
    if (currentPrice < prevLow && (prevLow - currentPrice) / prevLow * 100 < 2) {
      results.push({
        name: "Breakdown Structure", bias: "Bearish", confidence: 65,
        description: `Price broke below recent low at $${prevLow.toFixed(0)} — bearish continuation.`,
        target: currentPrice - atrVal * 2,
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/* ── Trade Zones ──────────────────────────────────────────────────── */

function computeTradeZones(
  supportLevels: ReturnType<typeof cluster>,
  resistanceLevels: ReturnType<typeof cluster>,
  atrVal: number,
  currentPrice: number,
  trend: TrendAnalysis,
): { longZone: TradeZone | null; shortZone: TradeZone | null } {
  const nearestSupport    = supportLevels.filter((l) => l.price < currentPrice).sort((a, b) => b.price - a.price)[0];
  const nearestResistance = resistanceLevels.filter((l) => l.price > currentPrice).sort((a, b) => a.price - b.price)[0];
  const strongSupport     = supportLevels.filter((l) => l.price < currentPrice).sort((a, b) => b.count - a.count)[0];
  const strongResistance  = resistanceLevels.filter((l) => l.price > currentPrice).sort((a, b) => b.count - a.count)[0];

  const slBuffer = atrVal * 0.6;
  let longZone: TradeZone | null = null;
  const supportBase = nearestSupport ?? strongSupport;
  if (supportBase) {
    const entryHigh = supportBase.price + slBuffer * 0.4;
    const entryLow  = supportBase.price - slBuffer * 0.2;
    const sl        = supportBase.price - slBuffer;
    const riskPerUnit = entryHigh - sl;
    const tp = nearestResistance ? nearestResistance.price - atrVal * 0.2 : currentPrice + atrVal * 3;
    const rr = riskPerUnit > 0 ? (tp - entryHigh) / riskPerUnit : 0;
    const distFromPrice = Math.abs(currentPrice - supportBase.price) / currentPrice * 100;
    const quality: TradeZone["quality"] = rr >= 2.5 && supportBase.count >= 3 ? "A+" : rr >= 1.8 ? "A" : rr >= 1.2 ? "B" : "C";
    const confidence = Math.min(90, 45 + supportBase.count * 8 + (trend.direction === "Bullish" ? 12 : 0));
    const reasoning  = `${strengthLabel(supportBase.count)} support at $${supportBase.price.toFixed(0)}, ${distFromPrice.toFixed(1)}% below. RR ${rr.toFixed(2)}:1.`;
    longZone = { direction: "LONG", entryLow, entryHigh, stopLoss: sl, takeProfit: tp, riskReward: rr, quality, confidence, reasoning };
  }

  let shortZone: TradeZone | null = null;
  const resistanceBase = nearestResistance ?? strongResistance;
  if (resistanceBase) {
    const entryLow  = resistanceBase.price - slBuffer * 0.4;
    const entryHigh = resistanceBase.price + slBuffer * 0.2;
    const sl        = resistanceBase.price + slBuffer;
    const riskPerUnit = sl - entryLow;
    const tp = nearestSupport ? nearestSupport.price + atrVal * 0.2 : currentPrice - atrVal * 3;
    const rr = riskPerUnit > 0 ? (entryLow - tp) / riskPerUnit : 0;
    const distFromPrice = Math.abs(currentPrice - resistanceBase.price) / currentPrice * 100;
    const quality: TradeZone["quality"] = rr >= 2.5 && resistanceBase.count >= 3 ? "A+" : rr >= 1.8 ? "A" : rr >= 1.2 ? "B" : "C";
    const confidence = Math.min(90, 45 + resistanceBase.count * 8 + (trend.direction === "Bearish" ? 12 : 0));
    const reasoning  = `${strengthLabel(resistanceBase.count)} resistance at $${resistanceBase.price.toFixed(0)}, ${distFromPrice.toFixed(1)}% above. RR ${rr.toFixed(2)}:1.`;
    shortZone = { direction: "SHORT", entryLow, entryHigh, stopLoss: sl, takeProfit: tp, riskReward: rr, quality, confidence, reasoning };
  }

  return { longZone, shortZone };
}

/* ── Summary ──────────────────────────────────────────────────────── */

function buildSummary(
  coin: string, interval: string,
  trend: TrendAnalysis, structure: StructureAnalysis,
  demandZones: AnalysisZone[], supplyZones: AnalysisZone[],
  patterns: PatternResult[],
  longZone: TradeZone | null, shortZone: TradeZone | null,
): ChartAnalysisSummary {
  const nearestDemand = demandZones[0]?.midpoint ?? 0;
  const nearestSupply = supplyZones[0]?.midpoint ?? 0;
  const topPattern = patterns[0];
  let bestSetup = "Await Signal";
  if (topPattern && topPattern.confidence >= 60) {
    bestSetup = topPattern.name + " " + (topPattern.bias === "Bullish" ? "Long" : topPattern.bias === "Bearish" ? "Short" : "Play");
  } else if (trend.direction === "Bullish" && structure.structure === "Bullish") {
    bestSetup = "Long Pullback";
  } else if (trend.direction === "Bearish" && structure.structure === "Bearish") {
    bestSetup = "Short Bounce";
  } else if (trend.direction === "Sideways") {
    bestSetup = "Range Play";
  }
  const trendScore     = trend.strength === "Strong" ? 25 : trend.strength === "Moderate" ? 15 : 5;
  const structScore    = structure.structure !== "Neutral" ? 20 : 5;
  const patternScore   = topPattern ? Math.round(topPattern.confidence * 0.3) : 0;
  const tradeZoneScore = (longZone ?? shortZone) ? 15 : 0;
  const confidence     = Math.min(97, 30 + trendScore + structScore + patternScore + tradeZoneScore);
  const bullPoints = (trend.direction === "Bullish" ? 2 : 0) + (structure.structure === "Bullish" ? 2 : 0);
  const bearPoints = (trend.direction === "Bearish" ? 2 : 0) + (structure.structure === "Bearish" ? 2 : 0);
  const bias: PatternBias = bullPoints > bearPoints ? "Bullish" : bearPoints > bullPoints ? "Bearish" : "Neutral";
  return { coin, interval, trend: trend.direction, structure: structure.structure, nearestDemand, nearestSupply, bestSetup, confidence, bias };
}

/* ── Market Forecast Engine ───────────────────────────────────────── */

function computeForecast(
  trend: TrendAnalysis,
  structure: StructureAnalysis,
  patterns: PatternResult[],
  supportLevels: AnalysisLevel[],
  resistanceLevels: AnalysisLevel[],
  currentPrice: number,
  atrVal: number,
): MarketForecast {
  let bull = 5, bear = 5, pull = 5, rev = 3, brk = 3, rng = 4;

  if (trend.direction === "Bullish") {
    bull += trend.strength === "Strong" ? 32 : trend.strength === "Moderate" ? 22 : 12;
    pull += trend.strength === "Strong" ? 10 : 14;
  } else if (trend.direction === "Bearish") {
    bear += trend.strength === "Strong" ? 32 : trend.strength === "Moderate" ? 22 : 12;
    pull += trend.strength === "Strong" ? 10 : 14;
  } else {
    rng += 22; brk += 12; bull += 4; bear += 4;
  }

  if (structure.structure === "Bullish") { bull += 18; pull += 4; }
  else if (structure.structure === "Bearish") { bear += 18; pull += 4; }
  else { rng += 8; rev += 5; }

  for (const p of patterns.slice(0, 2)) {
    const w = (p.confidence / 100) * 18;
    if (p.bias === "Bullish") { bull += w; brk += w * 0.3; }
    else if (p.bias === "Bearish") { bear += w; brk += w * 0.3; }
    else { rng += w * 0.5; brk += w * 0.5; }
    if (p.name === "Double Top" || p.name === "Double Bottom") rev += w * 0.5;
    if (p.name.includes("Triangle")) brk += w * 0.4;
  }

  const nearRes = resistanceLevels.filter((l) => l.distancePct < 0.8)[0];
  const nearSup = supportLevels.filter((l) => l.distancePct < 0.8)[0];
  if (nearRes) { brk += 8; }
  if (nearSup) { brk += 8; }

  const atrPct = currentPrice > 0 ? (atrVal / currentPrice) * 100 : 0.3;
  if (atrPct < 0.15) { rng += 18; brk += 10; bull *= 0.7; bear *= 0.7; }

  bull = Math.max(3, bull); bear = Math.max(3, bear); pull = Math.max(3, pull);
  rev = Math.max(2, rev); brk = Math.max(2, brk); rng = Math.max(2, rng);

  const total = bull + bear + pull + rev + brk + rng;
  const norm = (v: number) => Math.round((v / total) * 100);

  const scores = {
    bullishContinuation: norm(bull),
    bearishContinuation: norm(bear),
    pullback: norm(pull),
    reversal: norm(rev),
    breakout: norm(brk),
    range: norm(rng),
  };

  const entries: [ForecastScenario, number][] = [
    ["Bullish Continuation", scores.bullishContinuation],
    ["Bearish Continuation", scores.bearishContinuation],
    ["Pullback",             scores.pullback],
    ["Reversal",             scores.reversal],
    ["Breakout",             scores.breakout],
    ["Range",                scores.range],
  ];
  const [topScenario, topProbability] = entries.reduce((a, b) => b[1] > a[1] ? b : a);

  const explanation = generateForecastExplanation(topScenario, topProbability, trend, structure, patterns, atrPct);

  return { ...scores, topScenario, topProbability, explanation };
}

function generateForecastExplanation(
  scenario: ForecastScenario,
  prob: number,
  trend: TrendAnalysis,
  structure: StructureAnalysis,
  patterns: PatternResult[],
  atrPct: number,
): string {
  const topPattern = patterns[0];
  switch (scenario) {
    case "Bullish Continuation":
      return `${trend.strength} bullish trend with ${structure.structure.toLowerCase()} market structure makes continuation the most likely outcome at ${prob}%.${topPattern?.bias === "Bullish" ? ` ${topPattern.name} pattern adds confluence.` : ""} Buyers are in control — look for pullbacks into EMA as entry opportunities.`;
    case "Bearish Continuation":
      return `${trend.strength} bearish trend with ${structure.structure.toLowerCase()} market structure favors continuation lower at ${prob}%.${topPattern?.bias === "Bearish" ? ` ${topPattern.name} pattern confirms.` : ""} Sellers remain dominant — bounces are likely to be sold.`;
    case "Pullback":
      return `Price has extended from its moving averages and a ${trend.direction.toLowerCase()} trend remains intact. A healthy retracement (${prob}% probability) toward key support before the trend resumes is the most likely next move.`;
    case "Reversal":
      return `${topPattern ? `${topPattern.name} pattern detected with ${topPattern.confidence}% confidence. ` : ""}Market structure is showing signs of exhaustion at ${prob}% probability. Watch for a confirmed break of trend structure before trading the reversal.`;
    case "Breakout":
      return `${atrPct < 0.2 ? "Low volatility compression" : "Price near key level"} suggests an imminent breakout (${prob}%). The market is coiling — watch for a decisive candle close beyond the range to confirm direction.`;
    case "Range":
      return `Price is consolidating with no clear trend direction. Range-bound behavior is the most likely outcome at ${prob}% — trade the boundaries, buy support and sell resistance until a breakout occurs.`;
    default:
      return `Current market conditions favor ${scenario} at ${prob}% probability based on trend, structure, and pattern analysis.`;
  }
}

/* ── AI Analyst Text ──────────────────────────────────────────────── */

function generateAnalystText(
  trend: TrendAnalysis,
  structure: StructureAnalysis,
  supportLevels: AnalysisLevel[],
  resistanceLevels: AnalysisLevel[],
  demandZones: AnalysisZone[],
  supplyZones: AnalysisZone[],
  patterns: PatternResult[],
  currentPrice: number,
  atrVal: number,
): string {
  const lines: string[] = [];
  const fmtP = (p: number) => p >= 1000 ? `$${(p / 1000).toFixed(2)}k` : `$${p.toFixed(4)}`;

  const trendLine = trend.direction === "Bullish"
    ? `The market is in a ${trend.strength.toLowerCase()} uptrend, with price trading above the EMA-20 (${fmtP(trend.ema20)}) and EMA-50 (${fmtP(trend.ema50)}) for ${trend.durationCandles} candles.`
    : trend.direction === "Bearish"
    ? `The market is in a ${trend.strength.toLowerCase()} downtrend, with price below the EMA-20 (${fmtP(trend.ema20)}) and EMA-50 (${fmtP(trend.ema50)}) for ${trend.durationCandles} candles.`
    : `Price is ranging between the EMA-20 (${fmtP(trend.ema20)}) and EMA-50 (${fmtP(trend.ema50)}) with no clear directional bias.`;
  lines.push(trendLine);

  const structLine = structure.structure === "Bullish"
    ? `Market structure is bullish with ${structure.higherHighs} higher high${structure.higherHighs !== 1 ? "s" : ""} and ${structure.higherLows} higher low${structure.higherLows !== 1 ? "s" : ""}. Buyers are making progress, pushing both peaks and troughs higher.`
    : structure.structure === "Bearish"
    ? `Market structure is bearish with ${structure.lowerHighs} lower high${structure.lowerHighs !== 1 ? "s" : ""} and ${structure.lowerLows} lower low${structure.lowerLows !== 1 ? "s" : ""}. Sellers are in control, printing lower swings.`
    : "Market structure is neutral — no clear sequence of higher highs or lower lows. The market is in balance.";
  lines.push(structLine);

  const nearSup = supportLevels[0];
  const nearRes = resistanceLevels[0];
  const demandZ = demandZones[0];
  const supplyZ = supplyZones[0];
  const levelLines: string[] = [];
  if (nearSup) levelLines.push(`nearest support at ${fmtP(nearSup.price)} (${nearSup.distancePct.toFixed(2)}% below, ${nearSup.strengthLabel})`);
  if (nearRes) levelLines.push(`nearest resistance at ${fmtP(nearRes.price)} (${nearRes.distancePct.toFixed(2)}% above, ${nearRes.strengthLabel})`);
  if (demandZ) levelLines.push(`demand zone ${fmtP(demandZ.bottom)}–${fmtP(demandZ.top)} (${demandZ.strength})`);
  if (supplyZ) levelLines.push(`supply zone ${fmtP(supplyZ.bottom)}–${fmtP(supplyZ.top)} (${supplyZ.strength})`);
  if (levelLines.length) {
    lines.push(`Key levels: ${levelLines.slice(0, 3).join(", ")}.`);
  }

  if (patterns.length > 0) {
    const p = patterns[0];
    lines.push(`${p.name} pattern detected with ${p.confidence}% confidence. ${p.description}${p.target ? ` Price target: ${fmtP(p.target)}.` : ""}`);
  }

  const atrPct = currentPrice > 0 ? (atrVal / currentPrice) * 100 : 0;
  const volatility = atrPct > 0.5 ? "elevated" : atrPct > 0.2 ? "moderate" : "compressed";
  lines.push(`Volatility is ${volatility} (ATR ${fmtP(atrVal)}, ${atrPct.toFixed(3)}% of price). ${atrPct < 0.2 ? "Compression often precedes a significant breakout." : atrPct > 0.5 ? "High volatility — use wider stops." : "Normal trading conditions."}`);

  return lines.join("\n\n");
}

/* ── Why This Trade ───────────────────────────────────────────────── */

function generateWhyThisTrade(
  longZone: TradeZone | null,
  shortZone: TradeZone | null,
  trend: TrendAnalysis,
  structure: StructureAnalysis,
  patterns: PatternResult[],
  forecast: MarketForecast,
): string {
  const zone = trend.direction === "Bullish" ? longZone : trend.direction === "Bearish" ? shortZone : (longZone ?? shortZone);
  if (!zone) return "No high-probability trade setup is currently identified. Wait for price to approach a key level with confluence before entering.";

  const dir = zone.direction;
  const fmtP = (p: number) => p >= 1000 ? `$${(p / 1000).toFixed(2)}k` : `$${p.toFixed(4)}`;
  const lines: string[] = [];

  lines.push(`${dir} SETUP — ${zone.quality} Quality (${zone.confidence}% confidence)`);
  lines.push(`\nEntry: ${fmtP(zone.entryLow)} – ${fmtP(zone.entryHigh)}\nStop Loss: ${fmtP(zone.stopLoss)}\nTarget: ${fmtP(zone.takeProfit)}\nRisk/Reward: 1:${zone.riskReward.toFixed(2)}`);

  const reasons: string[] = [];
  if (dir === "LONG") {
    if (trend.direction === "Bullish") reasons.push(`${trend.strength} bullish trend is intact`);
    if (structure.structure === "Bullish") reasons.push(`bullish market structure (HH/HL pattern)`);
    const bullPat = patterns.find((p) => p.bias === "Bullish");
    if (bullPat) reasons.push(`${bullPat.name} pattern (${bullPat.confidence}% confidence)`);
    if (forecast.bullishContinuation > 40) reasons.push(`${forecast.bullishContinuation}% forecast probability for bullish continuation`);
    reasons.push(`${zone.reasoning}`);
  } else {
    if (trend.direction === "Bearish") reasons.push(`${trend.strength} bearish trend is intact`);
    if (structure.structure === "Bearish") reasons.push(`bearish market structure (LH/LL pattern)`);
    const bearPat = patterns.find((p) => p.bias === "Bearish");
    if (bearPat) reasons.push(`${bearPat.name} pattern (${bearPat.confidence}% confidence)`);
    if (forecast.bearishContinuation > 40) reasons.push(`${forecast.bearishContinuation}% forecast probability for bearish continuation`);
    reasons.push(`${zone.reasoning}`);
  }

  if (reasons.length) {
    lines.push("\nWhy this trade:");
    reasons.forEach((r) => lines.push(`• ${r}`));
  }

  return lines.join("\n");
}

/* ── Main Hook ────────────────────────────────────────────────────── */

const EMPTY_FORECAST: MarketForecast = {
  bullishContinuation: 0, bearishContinuation: 0, pullback: 0,
  reversal: 0, breakout: 0, range: 0,
  topScenario: "Range", topProbability: 0, explanation: "Loading…",
};

const EMPTY: ChartAnalysis = {
  currentPrice: 0, atr: 0,
  trend: { direction: "Sideways", strength: "Weak", durationCandles: 0, alignedTimeframes: 0, ema20: 0, ema50: 0 },
  structure: { structure: "Neutral", higherHighs: 0, higherLows: 0, lowerHighs: 0, lowerLows: 0, recentPoints: [], breakLevel: 0 },
  supportLevels: [], resistanceLevels: [],
  supplyZones: [], demandZones: [],
  patterns: [], longZone: null, shortZone: null,
  summary: { coin: "", interval: "", trend: "Sideways", structure: "Neutral", nearestDemand: 0, nearestSupply: 0, bestSetup: "—", confidence: 0, bias: "Neutral" },
  forecast: EMPTY_FORECAST,
  analystText: "Loading market analysis…",
  whyThisTrade: "Loading trade analysis…",
  _future: { orderFlowOverlay: null, liquidityOverlay: null, footprintAnalysis: null, volumeProfile: null, cvd: null, liquidationClusters: null },
};

export function useChartAnalysis(candles: Candle[], currentPrice: number, coin: string, interval: string): ChartAnalysis {
  return useMemo(() => {
    if (candles.length < 20 || !currentPrice) return EMPTY;

    const atrVal = atr(candles);
    const zoneHalf = atrVal * 0.7;

    const highs = swingHighs(candles, 3);
    const lows  = swingLows(candles, 3);

    const rawRes = highs.map((h) => h.price);
    const rawSup = lows.map((l) => l.price);

    const resClusters = cluster(rawRes, 0.4, "resistance").filter((l) => l.price >= currentPrice * 0.997);
    const supClusters = cluster(rawSup, 0.4, "support").filter((l) => l.price <= currentPrice * 1.003);

    const supportLevels: AnalysisLevel[] = supClusters.map((l) => ({
      price: l.price, strength: Math.min(5, l.count), strengthLabel: strengthLabel(l.count),
      type: "support", distancePct: (currentPrice - l.price) / currentPrice * 100,
    }));
    const resistanceLevels: AnalysisLevel[] = resClusters.map((l) => ({
      price: l.price, strength: Math.min(5, l.count), strengthLabel: strengthLabel(l.count),
      type: "resistance", distancePct: (l.price - currentPrice) / currentPrice * 100,
    }));

    const demandZones: AnalysisZone[] = supClusters.slice(0, 3).map((l) => {
      const top = l.price + zoneHalf * 0.3, bottom = l.price - zoneHalf;
      return {
        top, bottom, midpoint: (top + bottom) / 2, type: "demand",
        strength: strengthLabel(l.count),
        widthPct: (top - bottom) / currentPrice * 100,
        valid: l.count >= 2,
        distancePct: (currentPrice - l.price) / currentPrice * 100,
      };
    });
    const supplyZones: AnalysisZone[] = resClusters.slice(0, 3).map((l) => {
      const top = l.price + zoneHalf, bottom = l.price - zoneHalf * 0.3;
      return {
        top, bottom, midpoint: (top + bottom) / 2, type: "supply",
        strength: strengthLabel(l.count),
        widthPct: (top - bottom) / currentPrice * 100,
        valid: l.count >= 2,
        distancePct: (l.price - currentPrice) / currentPrice * 100,
      };
    });

    const trend     = computeTrend(candles, currentPrice);
    const structure = computeStructure(highs, lows, currentPrice);
    const patterns  = detectPatterns(candles, highs, lows, atrVal, currentPrice);
    const { longZone, shortZone } = computeTradeZones(supClusters, resClusters, atrVal, currentPrice, trend);
    const summary   = buildSummary(coin, interval, trend, structure, demandZones, supplyZones, patterns, longZone, shortZone);
    const forecast  = computeForecast(trend, structure, patterns, supportLevels, resistanceLevels, currentPrice, atrVal);
    const analystText = generateAnalystText(trend, structure, supportLevels, resistanceLevels, demandZones, supplyZones, patterns, currentPrice, atrVal);
    const whyThisTrade = generateWhyThisTrade(longZone, shortZone, trend, structure, patterns, forecast);

    return {
      currentPrice, atr: atrVal, trend, structure,
      supportLevels, resistanceLevels, supplyZones, demandZones,
      patterns, longZone, shortZone, summary,
      forecast, analystText, whyThisTrade,
      _future: EMPTY._future,
    };
  }, [candles, currentPrice, coin, interval]);
}
