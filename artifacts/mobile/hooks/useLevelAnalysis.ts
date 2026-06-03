import { useMemo } from "react";

import type { Candle } from "./useKlineData";

export interface Level {
  price: number;
  strength: number;
  type: "support" | "resistance";
}

export interface Zone {
  top: number;
  bottom: number;
  strength: number;
  type: "supply" | "demand";
}

export type LevelStrength = "Weak" | "Medium" | "Strong";

export interface LevelAnalysis {
  swingHighPrices: number[];
  swingLowPrices: number[];
  supportLevels: Level[];
  resistanceLevels: Level[];
  supplyZones: Zone[];
  demandZones: Zone[];
  nearestSupport: number;
  nearestResistance: number;
  strongSupport: number;
  strongResistance: number;
  breakoutLevel: number;
  breakdownLevel: number;
  chartBias: "Bullish" | "Bearish" | "Neutral";
  supportStrength: LevelStrength;
  resistanceStrength: LevelStrength;
  trendSlope: number;
}

const EMPTY: LevelAnalysis = {
  swingHighPrices: [], swingLowPrices: [],
  supportLevels: [], resistanceLevels: [],
  supplyZones: [], demandZones: [],
  nearestSupport: 0, nearestResistance: 0,
  strongSupport: 0, strongResistance: 0,
  breakoutLevel: 0, breakdownLevel: 0,
  chartBias: "Neutral", supportStrength: "Weak", resistanceStrength: "Weak",
  trendSlope: 0,
};

/* ── Swing detection ─────────────────────────────────────────────── */
interface SwingPoint { price: number; index: number }

function findSwingHighs(candles: Candle[], lookback = 3): SwingPoint[] {
  const pts: SwingPoint[] = [];
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

function findSwingLows(candles: Candle[], lookback = 3): SwingPoint[] {
  const pts: SwingPoint[] = [];
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

/* ── Level clustering ────────────────────────────────────────────── */
function clusterLevels(prices: number[], proximityPct: number, type: "support" | "resistance"): Level[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const avg = last.reduce((a, b) => a + b, 0) / last.length;
    if (Math.abs(sorted[i] - avg) / avg * 100 < proximityPct) {
      last.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters
    .map((c) => ({ price: c.reduce((a, b) => a + b, 0) / c.length, strength: Math.min(5, c.length), type }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6);
}

/* ── ATR ─────────────────────────────────────────────────────────── */
function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const recent = candles.slice(-period);
  let total = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    total += Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - prev),
      Math.abs(recent[i].low - prev),
    );
  }
  return total / (recent.length - 1);
}

/* ── Trend bias ──────────────────────────────────────────────────── */
function computeBias(candles: Candle[]): { bias: "Bullish" | "Bearish" | "Neutral"; slope: number } {
  if (candles.length < 10) return { bias: "Neutral", slope: 0 };
  const closes = candles.slice(-30).map((c) => c.close);
  const n = closes.length;
  const xMean = (n - 1) / 2;
  const yMean = closes.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (closes[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const normSlope = (slope / yMean) * 100;
  return {
    slope: normSlope,
    bias: normSlope > 0.015 ? "Bullish" : normSlope < -0.015 ? "Bearish" : "Neutral",
  };
}

function strengthLabel(s: number): LevelStrength {
  if (s >= 3) return "Strong";
  if (s >= 2) return "Medium";
  return "Weak";
}

/* ── Main computation ────────────────────────────────────────────── */
function computeLevels(candles: Candle[], price: number): LevelAnalysis {
  if (candles.length < 20 || !price) return EMPTY;

  const atr = computeATR(candles);
  const zoneHalf = atr * 0.6;

  const swingHighs = findSwingHighs(candles, 3);
  const swingLows = findSwingLows(candles, 3);

  const rawResistance = swingHighs.map((s) => s.price);
  const rawSupport = swingLows.map((s) => s.price);

  const resistanceLevels = clusterLevels(rawResistance, 0.35, "resistance")
    .filter((l) => l.price >= price * 0.995);
  const supportLevels = clusterLevels(rawSupport, 0.35, "support")
    .filter((l) => l.price <= price * 1.005);

  const supplyZones: Zone[] = resistanceLevels.slice(0, 3).map((l) => ({
    top: l.price + zoneHalf, bottom: l.price - zoneHalf * 0.3,
    strength: l.strength, type: "supply",
  }));
  const demandZones: Zone[] = supportLevels.slice(0, 3).map((l) => ({
    top: l.price + zoneHalf * 0.3, bottom: l.price - zoneHalf,
    strength: l.strength, type: "demand",
  }));

  const abovePrice = resistanceLevels.filter((l) => l.price > price).sort((a, b) => a.price - b.price);
  const belowPrice = supportLevels.filter((l) => l.price < price).sort((a, b) => b.price - a.price);

  const nearestResistance = abovePrice[0]?.price ?? 0;
  const nearestSupport = belowPrice[0]?.price ?? 0;
  const strongResistance = [...abovePrice].sort((a, b) => b.strength - a.strength)[0]?.price ?? nearestResistance;
  const strongSupport = [...belowPrice].sort((a, b) => b.strength - a.strength)[0]?.price ?? nearestSupport;
  const breakoutLevel = nearestResistance;
  const breakdownLevel = nearestSupport;

  const { bias: chartBias, slope: trendSlope } = computeBias(candles);

  const maxResStrength = resistanceLevels[0]?.strength ?? 0;
  const maxSupStrength = supportLevels[0]?.strength ?? 0;

  return {
    swingHighPrices: swingHighs.map((s) => s.price),
    swingLowPrices: swingLows.map((s) => s.price),
    supportLevels, resistanceLevels,
    supplyZones, demandZones,
    nearestSupport, nearestResistance,
    strongSupport, strongResistance,
    breakoutLevel, breakdownLevel,
    chartBias, trendSlope,
    supportStrength: strengthLabel(maxSupStrength),
    resistanceStrength: strengthLabel(maxResStrength),
  };
}

export function useLevelAnalysis(candles: Candle[], currentPrice: number): LevelAnalysis {
  return useMemo(() => computeLevels(candles, currentPrice), [candles, currentPrice]);
}
