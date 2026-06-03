import { useCallback, useEffect, useRef, useState } from "react";

export type TrendDir = "Bullish" | "Bearish" | "Neutral";

export interface TFTrend {
  tf: string;
  trend: TrendDir;
  priceVsMA: number;
}

export interface MarketStructure {
  trends: TFTrend[];
  momentumScore: number;
  support: number;
  resistance: number;
  supportPct: number;
  resistancePct: number;
  dominantTrend: TrendDir;
  reasoning: string;
  lastUpdated: number;
}

interface RawKline {
  high: number;
  low: number;
  close: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<RawKline[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const raw: unknown[][] = await res.json();
    return raw.map((k) => ({
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
    }));
  } catch {
    return [];
  }
}

function sma(arr: number[], period: number): number {
  if (arr.length < period) return arr[arr.length - 1] ?? 0;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function computeTrend(tf: string, klines: RawKline[]): TFTrend {
  if (!klines.length) return { tf, trend: "Neutral", priceVsMA: 0 };
  const closes = klines.map((k) => k.close);
  const price = closes[closes.length - 1];
  const ma = sma(closes, Math.min(20, closes.length));
  const pct = ((price - ma) / ma) * 100;
  const trend: TrendDir = pct > 0.12 ? "Bullish" : pct < -0.12 ? "Bearish" : "Neutral";
  return { tf, trend, priceVsMA: parseFloat(pct.toFixed(3)) };
}

function computeMomentum(klines1m: RawKline[]): number {
  if (klines1m.length < 7) return 0;
  const closes = klines1m.map((k) => k.close);
  const recent = closes[closes.length - 1];
  const prior = closes[closes.length - 7];
  if (!prior) return 0;
  const roc = ((recent - prior) / prior) * 100;
  return Math.max(-20, Math.min(20, parseFloat((roc * 6).toFixed(1))));
}

function computeSupportResistance(klines5m: RawKline[], price: number) {
  if (!klines5m.length || !price) {
    return { support: 0, resistance: 0, supportPct: 0, resistancePct: 0 };
  }
  const recent = klines5m.slice(-20);
  const support = Math.min(...recent.map((k) => k.low));
  const resistance = Math.max(...recent.map((k) => k.high));
  const supportPct = parseFloat((((price - support) / price) * 100).toFixed(2));
  const resistancePct = parseFloat((((resistance - price) / price) * 100).toFixed(2));
  return { support, resistance, supportPct, resistancePct };
}

function generateReasoning(trends: TFTrend[], momentumScore: number): string {
  const bull = trends.filter((t) => t.trend === "Bullish").map((t) => t.tf);
  const bear = trends.filter((t) => t.trend === "Bearish").map((t) => t.tf);

  const parts: string[] = [];

  if (bear.length >= 3) {
    parts.push(`Short-term structure is predominantly bearish across ${bear.join(", ")} timeframes.`);
  } else if (bull.length >= 3) {
    parts.push(`Short-term structure is predominantly bullish across ${bull.join(", ")} timeframes.`);
  } else if (bull.length > 0 && bear.length > 0) {
    parts.push(`Mixed timeframe alignment — ${bull.join(", ")} bullish vs ${bear.join(", ")} bearish.`);
  } else {
    parts.push("Timeframes are broadly neutral with no clear directional bias.");
  }

  if (momentumScore <= -10) {
    parts.push("Momentum is strongly negative, confirming downside pressure.");
  } else if (momentumScore >= 10) {
    parts.push("Momentum is strongly positive, supporting bullish continuation.");
  } else if (momentumScore < 0) {
    parts.push("Momentum is mildly negative.");
  } else if (momentumScore > 0) {
    parts.push("Momentum is mildly positive.");
  } else {
    parts.push("Momentum is flat.");
  }

  return parts.join(" ");
}

function getDominant(trends: TFTrend[]): TrendDir {
  const bull = trends.filter((t) => t.trend === "Bullish").length;
  const bear = trends.filter((t) => t.trend === "Bearish").length;
  if (bull > bear) return "Bullish";
  if (bear > bull) return "Bearish";
  return "Neutral";
}

const EMPTY: MarketStructure = {
  trends: [],
  momentumScore: 0,
  support: 0,
  resistance: 0,
  supportPct: 0,
  resistancePct: 0,
  dominantTrend: "Neutral",
  reasoning: "",
  lastUpdated: 0,
};

export function useMarketStructure(price: number, symbol: string = "BTCUSDT"): MarketStructure {
  const [ms, setMs] = useState<MarketStructure>(EMPTY);
  const priceRef = useRef(price);
  priceRef.current = price;

  const fetchAndCompute = useCallback(async () => {
    const p = priceRef.current;
    if (!p) return;

    const [k1m, k5m, k15m, k1h] = await Promise.all([
      fetchKlines(symbol, "1m", 22),
      fetchKlines(symbol, "5m", 22),
      fetchKlines(symbol, "15m", 22),
      fetchKlines(symbol, "1h", 22),
    ]);

    const trends: TFTrend[] = [
      computeTrend("1m", k1m),
      computeTrend("5m", k5m),
      computeTrend("15m", k15m),
      computeTrend("1h", k1h),
    ];

    const momentumScore = computeMomentum(k1m);
    const { support, resistance, supportPct, resistancePct } = computeSupportResistance(k5m, p);
    const dominantTrend = getDominant(trends);
    const reasoning = generateReasoning(trends, momentumScore);

    setMs({ trends, momentumScore, support, resistance, supportPct, resistancePct, dominantTrend, reasoning, lastUpdated: Date.now() });
  }, [symbol]);

  useEffect(() => {
    if (price) fetchAndCompute();
  }, [price > 0, fetchAndCompute]);

  useEffect(() => {
    fetchAndCompute();
    const timer = setInterval(fetchAndCompute, 20_000);
    return () => clearInterval(timer);
  }, [fetchAndCompute]);

  return ms;
}
