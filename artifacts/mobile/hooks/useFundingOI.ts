import { useEffect, useRef, useState } from "react";

/* ── Types ──────────────────────────────────────────────────────── */

export interface FundingPoint {
  time: number;
  rate: number;
}

export interface OIPoint {
  time: number;
  oi: number;
}

export interface FundingOIData {
  fundingHistory: FundingPoint[];
  oiHistory: OIPoint[];
  currentFundingRate: number;
  fundingTrend: "Rising" | "Falling" | "Flat";
  fundingDirection: "Bullish" | "Bearish" | "Neutral";
  nextFundingTime: number;
  currentOI: number;
  oiChange: number;
  oiTrend: "Rising" | "Falling" | "Flat";
  marketInterpretation: string;
  marketDetail: string;
  participationScore: number;
  participationLevel: "Low" | "Moderate" | "High";
  fundingBias: "Bullish" | "Bearish" | "Neutral";
  oiBias: "Bullish" | "Bearish" | "Neutral";
  combinedBias: "Bullish" | "Bearish" | "Neutral" | "Mixed";
  overallSentiment: string;
  ready: boolean;
}

/* ── Fetch helpers ──────────────────────────────────────────────── */

async function fetchFundingHistory(symbol: string): Promise<FundingPoint[]> {
  try {
    const r = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=20`,
      { cache: "no-store" },
    );
    if (!r.ok) return [];
    const data: unknown[] = await r.json();
    return (data as { fundingTime: number; fundingRate: string }[])
      .map((d) => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) }))
      .sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchOIHistory(symbol: string): Promise<OIPoint[]> {
  try {
    const r = await fetch(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=30m&limit=20`,
      { cache: "no-store" },
    );
    if (!r.ok) return [];
    const data: unknown[] = await r.json();
    return (data as { timestamp: number; sumOpenInterest: string }[])
      .map((d) => ({ time: d.timestamp, oi: parseFloat(d.sumOpenInterest) }))
      .sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchPremiumIndex(symbol: string): Promise<{ rate: number; next: number }> {
  try {
    const r = await fetch(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      { cache: "no-store" },
    );
    if (!r.ok) return { rate: 0, next: 0 };
    const d = await r.json();
    return {
      rate: parseFloat(d.lastFundingRate) || 0,
      next: parseInt(d.nextFundingTime) || 0,
    };
  } catch { return { rate: 0, next: 0 }; }
}

async function fetchCurrentOI(symbol: string): Promise<number> {
  try {
    const r = await fetch(
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
      { cache: "no-store" },
    );
    if (!r.ok) return 0;
    const d = await r.json();
    return parseFloat(d.openInterest) || 0;
  } catch { return 0; }
}

/* ── Analysis helpers ───────────────────────────────────────────── */

function computeFundingTrend(history: FundingPoint[]): "Rising" | "Falling" | "Flat" {
  if (history.length < 3) return "Flat";
  const last3 = history.slice(-3);
  const delta = last3[2].rate - last3[0].rate;
  if (delta > 0.00001) return "Rising";
  if (delta < -0.00001) return "Falling";
  return "Flat";
}

function computeOITrend(history: OIPoint[]): "Rising" | "Falling" | "Flat" {
  if (history.length < 3) return "Flat";
  const last3 = history.slice(-3);
  const delta = (last3[2].oi - last3[0].oi) / last3[0].oi;
  if (delta > 0.005) return "Rising";
  if (delta < -0.005) return "Falling";
  return "Flat";
}

function computeMarketInterpretation(
  oiTrend: "Rising" | "Falling" | "Flat",
  priceChange: number,
): { interpretation: string; detail: string } {
  const priceUp = priceChange >= 0;
  if (oiTrend === "Rising" && priceUp)
    return { interpretation: "Potential Bullish Continuation", detail: "Rising open interest with rising price signals new longs entering — trend continuation likely." };
  if (oiTrend === "Rising" && !priceUp)
    return { interpretation: "Potential Bearish Continuation", detail: "Rising open interest with falling price means new shorts entering — bearish pressure building." };
  if (oiTrend === "Falling" && priceUp)
    return { interpretation: "Weak Bullish (Short Covering)", detail: "Falling OI with rising price suggests short covering rather than new longs — rally may be weak." };
  if (oiTrend === "Falling" && !priceUp)
    return { interpretation: "Weak Bearish (Long Liquidation)", detail: "Falling OI with falling price indicates long liquidation rather than new shorts — sell-off may exhaust." };
  return { interpretation: "Neutral / Consolidation", detail: "Open interest and price are moving sideways — market is in equilibrium." };
}

function computeParticipation(
  oiTrend: "Rising" | "Falling" | "Flat",
  oiChange: number,
): { score: number; level: "Low" | "Moderate" | "High" } {
  const abs = Math.abs(oiChange);
  const score =
    abs > 5 ? 80 + Math.min(20, (abs - 5) * 2) :
    abs > 2 ? 50 + Math.round((abs - 2) * 10) :
    abs > 0.5 ? 30 :
    15;
  const level: "Low" | "Moderate" | "High" =
    score >= 70 ? "High" : score >= 40 ? "Moderate" : "Low";
  return { score: Math.min(100, score), level };
}

/* ── Empty state ────────────────────────────────────────────────── */

const EMPTY: FundingOIData = {
  fundingHistory: [], oiHistory: [],
  currentFundingRate: 0, fundingTrend: "Flat", fundingDirection: "Neutral",
  nextFundingTime: 0, currentOI: 0, oiChange: 0, oiTrend: "Flat",
  marketInterpretation: "Loading…", marketDetail: "",
  participationScore: 0, participationLevel: "Low",
  fundingBias: "Neutral", oiBias: "Neutral", combinedBias: "Neutral",
  overallSentiment: "Loading market data…", ready: false,
};

/* ── Hook ───────────────────────────────────────────────────────── */

export function useFundingOI(priceChange: number, symbol: string = "BTCUSDT"): FundingOIData {
  const [state, setState] = useState<FundingOIData>(EMPTY);
  const oiSnapshotsRef = useRef<OIPoint[]>([]);

  useEffect(() => {
    oiSnapshotsRef.current = [];
    setState(EMPTY);
  }, [symbol]);

  useEffect(() => {
    const load = async () => {
      const [fundingHistory, oiHistory, premium, currentOI] = await Promise.all([
        fetchFundingHistory(symbol),
        fetchOIHistory(symbol),
        fetchPremiumIndex(symbol),
        fetchCurrentOI(symbol),
      ]);

      const oiData = oiHistory.length > 2 ? oiHistory : oiSnapshotsRef.current;

      if (currentOI > 0) {
        oiSnapshotsRef.current = [
          ...oiSnapshotsRef.current,
          { time: Date.now(), oi: currentOI },
        ].slice(-20);
      }

      const fr = premium.rate || (fundingHistory.length ? fundingHistory[fundingHistory.length - 1].rate : 0);
      const fundingTrend = computeFundingTrend(fundingHistory);
      const fundingDirection: "Bullish" | "Bearish" | "Neutral" =
        fr < -0.00001 ? "Bullish" : fr > 0.00001 ? "Bearish" : "Neutral";

      const oiForTrend = oiData.length > 2 ? oiData : [];
      const oiTrend = computeOITrend(oiForTrend);

      const oiFirst = oiData.length > 1 ? oiData[0].oi : currentOI;
      const oiLast  = currentOI || (oiData.length ? oiData[oiData.length - 1].oi : 0);
      const oiChange = oiFirst > 0 ? ((oiLast - oiFirst) / oiFirst) * 100 : 0;

      const { interpretation, detail } = computeMarketInterpretation(oiTrend, priceChange);
      const { score, level } = computeParticipation(oiTrend, oiChange);

      const fundingBias: "Bullish" | "Bearish" | "Neutral" = fundingDirection;
      const oiBias: "Bullish" | "Bearish" | "Neutral" =
        oiTrend === "Rising" && priceChange >= 0 ? "Bullish" :
        oiTrend === "Rising" && priceChange < 0  ? "Bearish" :
        "Neutral";
      const combinedBias: "Bullish" | "Bearish" | "Neutral" | "Mixed" =
        fundingBias === oiBias && fundingBias !== "Neutral" ? fundingBias :
        fundingBias === "Neutral" && oiBias !== "Neutral"   ? oiBias :
        oiBias === "Neutral" && fundingBias !== "Neutral"   ? fundingBias :
        fundingBias !== oiBias && fundingBias !== "Neutral" && oiBias !== "Neutral" ? "Mixed" :
        "Neutral";

      const overallSentiment =
        combinedBias === "Bullish" ? "Market participants are positioned for upside. Long bias dominant." :
        combinedBias === "Bearish" ? "Market participants are positioned for downside. Short bias dominant." :
        combinedBias === "Mixed"   ? "Conflicting signals — funding and OI suggest different directions." :
        "Market sentiment is neutral. No clear directional positioning.";

      setState({
        fundingHistory, oiHistory: oiData, currentFundingRate: fr,
        fundingTrend, fundingDirection, nextFundingTime: premium.next,
        currentOI: oiLast, oiChange, oiTrend,
        marketInterpretation: interpretation, marketDetail: detail,
        participationScore: score, participationLevel: level,
        fundingBias, oiBias, combinedBias, overallSentiment, ready: true,
      });
    };

    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [symbol, priceChange]);

  return state;
}
