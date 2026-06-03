/**
 * Multi-coin Auto Trader
 * Monitors all 4 coin engines and surfaces best trading opportunities
 * when signal quality exceeds the configured threshold.
 */
import { useMemo } from "react";

import type { AllEngines } from "@/context/TradingContext";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface AutoOpportunity {
  coin: string;
  ticker: string;
  signal: "LONG" | "SHORT";
  qualityScore: number;
  qualityCategory: string;
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  probability: number;
  confirmedFactors: number;
  totalFactors: number;
  explanation: string;
  rejectionReasons: string[];
}

export interface CoinQualityStatus {
  coin: string;
  ticker: string;
  signal: "LONG" | "SHORT" | "WAIT";
  qualityScore: number;
  qualityCategory: string;
  timeframe: string;
  probability: number;
  meetsThreshold: boolean;
  entryRejected: boolean;
  confirmedFactors: number;
}

export interface AutoTraderState {
  opportunities: AutoOpportunity[];
  bestOpportunity: AutoOpportunity | null;
  coinStatuses: CoinQualityStatus[];
  totalOpportunities: number;
  highestQuality: number;
}

const COIN_TICKERS: Record<string, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", XRPUSDT: "XRP",
};

/* ── Hook ────────────────────────────────────────────────────────────── */

export function useAutoTrader(
  allEngines: AllEngines,
  enabled: boolean,
  qualityThreshold: number,
): AutoTraderState {
  return useMemo(() => {
    const coinStatuses: CoinQualityStatus[] = [];
    const opportunities: AutoOpportunity[]  = [];

    for (const [coin, engine] of Object.entries(allEngines)) {
      const { analysis, data, probability } = engine;
      const ticker = COIN_TICKERS[coin] ?? coin;

      const status: CoinQualityStatus = {
        coin, ticker,
        signal:           analysis.signal,
        qualityScore:     analysis.signalQualityScore ?? 0,
        qualityCategory:  analysis.qualityCategory ?? "Poor",
        timeframe:        analysis.signalTimeframe ?? "15m",
        probability:      probability.probability,
        meetsThreshold:   (analysis.signalQualityScore ?? 0) >= qualityThreshold && analysis.signal !== "WAIT",
        entryRejected:    analysis.entryRejected ?? false,
        confirmedFactors: analysis.confirmedFactors ?? 0,
      };
      coinStatuses.push(status);

      if (!enabled) continue;
      if (analysis.signal === "WAIT") continue;
      if ((analysis.signalQualityScore ?? 0) < qualityThreshold) continue;
      if (analysis.entryRejected) continue;
      if (!analysis.entry) continue;

      const price = data.price || data.markPrice;
      const entry = analysis.entry;

      opportunities.push({
        coin, ticker,
        signal:           analysis.signal as "LONG" | "SHORT",
        qualityScore:     analysis.signalQualityScore ?? 0,
        qualityCategory:  analysis.qualityCategory ?? "Moderate",
        timeframe:        analysis.signalTimeframe ?? "15m",
        entryPrice:       price,
        stopLoss:         entry.stopLoss,
        takeProfit:       entry.takeProfit2,  // use TP2 as the auto target
        probability:      probability.probability,
        confirmedFactors: analysis.confirmedFactors ?? 0,
        totalFactors:     analysis.totalFactors ?? 8,
        explanation:      (analysis.signalExplanation ?? []).slice(0, 2).join(" "),
        rejectionReasons: analysis.rejectionReasons ?? [],
      });
    }

    /* Sort by quality score descending */
    opportunities.sort((a, b) => b.qualityScore - a.qualityScore);
    coinStatuses.sort((a, b) => b.qualityScore - a.qualityScore);

    const bestOpportunity  = opportunities[0] ?? null;
    const highestQuality   = coinStatuses.length
      ? Math.max(...coinStatuses.map((c) => c.qualityScore))
      : 0;

    return { opportunities, bestOpportunity, coinStatuses, totalOpportunities: opportunities.length, highestQuality };
  }, [allEngines, enabled, qualityThreshold]);
}
