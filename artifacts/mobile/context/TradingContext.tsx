import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { COIN_MAP, type CoinSymbol } from "@/constants/coins";
import { useAlerts, type AlertItem, type AlertStats } from "@/hooks/useAlerts";
import { useBinanceData } from "@/hooks/useBinanceData";
import { useKlineData } from "@/hooks/useKlineData";
import { type LiquidityData, useLiquidityData } from "@/hooks/useLiquidityData";
import { useMarketStructure, type MarketStructure } from "@/hooks/useMarketStructure";
import { type OrderFlowData, useOrderFlow } from "@/hooks/useOrderFlow";
import { useProbabilityEngine, type ProbabilityResult } from "@/hooks/useProbabilityEngine";
import { useSignalAnalysis, type SignalAnalysis } from "@/hooks/useSignal";
import { useSignalHistory, type SignalEntry } from "@/hooks/useSignalHistory";
import { useSelectedCoin } from "@/context/CoinContext";

/* ── Types ──────────────────────────────────────────────────────── */

export interface CoinEngine {
  data: BinanceData;
  analysis: SignalAnalysis & { ms?: MarketStructure };
  ms: MarketStructure;
  history: SignalEntry[];
  orderFlow: OrderFlowData;
  liquidity: LiquidityData;
  probability: ProbabilityResult;
  alerts: AlertItem[];
  alertStats: AlertStats;
}

/* ── Shared empty values ────────────────────────────────────────── */

const EMPTY_DATA: BinanceData = {
  price: 0, priceChange: 0, priceChangePercent: 0, quoteVolume: 0,
  markPrice: 0, indexPrice: 0, fundingRate: 0, nextFundingTime: 0,
  openInterest: 0, isConnected: false, lastUpdated: 0,
  dataAge: 0, freshnessStatus: "disconnected",
};
const EMPTY_ANALYSIS: SignalAnalysis = {
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
const EMPTY_MS: MarketStructure = {
  trends: [], momentumScore: 0, support: 0, resistance: 0,
  supportPct: 0, resistancePct: 0, dominantTrend: "Neutral", reasoning: "", lastUpdated: 0,
};
const EMPTY_AGGR = { value: 0, trend: "Stable" as const, strength: "Weak" as const };
const EMPTY_OF: OrderFlowData = {
  buyerAggression: 0, sellerAggression: 0, delta: 0, deltaUSD: 0,
  volumeImbalance: 0, buyingPressure: 0, sellingPressure: 0,
  totalVolume: 0, buyVolume: 0, sellVolume: 0,
  summary: "Loading...", environment: "—", ready: false,
  buyerAggressionMetric: EMPTY_AGGR,
  sellerAggressionMetric: EMPTY_AGGR,
  deltaAnalysis: { current: 0, currentUSD: 0, trend: "Neutral", strength: "Weak", history: [] },
  tradePressure: { buying: 0, selling: 0, trend: "Stable", strength: "Weak" },
  volumeImbalanceData: { buyPct: 50, sellPct: 50, imbalance: 0, bias: "Balanced", strength: "Weak" },
  score: { score: 50, bias: "Neutral", strength: "Weak" },
  alerts: [],
  marketExplanation: "Loading…",
  tradeCount: 0, tradesPerSecond: 0,
  dataSource: "loading",
  lastTradeTime: 0, bidAskRatio: 1,
  totalBidDepthUSD: 0, totalAskDepthUSD: 0,
  _future: { cvd: null, footprint: null, volumeProfile: null, absorptionDetection: null, liquiditySweeps: null, domAnalysis: null, liquidationClusters: null },
};
const EMPTY_PROB: ProbabilityResult = {
  probability: 0, riskLevel: "High", setupQuality: "Noise",
  holdTime: "Intraday (1–4 hours)", confluenceScore: 0, totalConditions: 9,
  conditions: [], readiness: 0, explanation: [], direction: "WAIT", ready: false,
};
const EMPTY_LIQUIDITY: LiquidityData = {
  largestBidWall: { price: 0, sizeUSD: 0, size: 0, distancePct: 0 },
  largestAskWall: { price: 0, sizeUSD: 0, size: 0, distancePct: 0 },
  nearestSupportLiquidity: { price: 0, sizeUSD: 0, size: 0, distancePct: 0 },
  nearestResistanceLiquidity: { price: 0, sizeUSD: 0, size: 0, distancePct: 0 },
  liquidityImbalance: 1, imbalanceBias: "Balanced",
  totalBidUSD: 0, totalAskUSD: 0,
  strongSupport: null, strongResistance: null, liquidityClusters: [],
  pressure: { buyingPressure: 50, sellingPressure: 50, direction: "Neutral", strength: "Weak", trend: "Neutral" },
  liquidityScore: 50, liquidityBias: "Neutral", liquidityStrength: "Weak",
  explanation: "Loading…", explanationBullets: [],
  ready: false, lastUpdated: 0,
  _future: { footprint: null, cvd: null, absorptionDetection: null, volumeProfile: null, liquidationClusters: null, domAnalysis: null },
};
const EMPTY_STATS: AlertStats = { total: 0, critical: 0, high: 0, lastAlertTime: 0 };

const EMPTY_ENGINE: CoinEngine = {
  data: EMPTY_DATA, analysis: EMPTY_ANALYSIS, ms: EMPTY_MS,
  history: [], orderFlow: EMPTY_OF, liquidity: EMPTY_LIQUIDITY,
  probability: EMPTY_PROB, alerts: [], alertStats: EMPTY_STATS,
};

/* ── Per-coin engine hook (with real-time integration) ───────────── */

interface BinanceData {
  price: number;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
  isConnected: boolean;
  lastUpdated: number;
  dataAge: number;
  freshnessStatus: "live" | "warning" | "delayed" | "disconnected";
}

interface OrderFlowData {
  buyerAggression: number;
  sellerAggression: number;
  delta: number;
  deltaUSD: number;
  volumeImbalance: number;
  buyingPressure: number;
  sellingPressure: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  summary: string;
  environment: string;
  ready: boolean;
  buyerAggressionMetric: { value: number; trend: string; strength: string };
  sellerAggressionMetric: { value: number; trend: string; strength: string };
  deltaAnalysis: { current: number; currentUSD: number; trend: string; strength: string; history: number[] };
  tradePressure: { buying: number; selling: number; trend: string; strength: string };
  volumeImbalanceData: { buyPct: number; sellPct: number; imbalance: number; bias: string; strength: string };
  score: { score: number; bias: string; strength: string };
  alerts: unknown[];
  marketExplanation: string;
  tradeCount: number;
  tradesPerSecond: number;
  dataSource: string;
  lastTradeTime: number;
  bidAskRatio: number;
  totalBidDepthUSD: number;
  totalAskDepthUSD: number;
  _future: Record<string, null>;
}

function useCoinEngine(symbol: CoinSymbol): CoinEngine {
  const ticker = COIN_MAP[symbol].ticker;

  /* Use Binance data with real-time fallback */
  const raw = useBinanceData(symbol);
  const { candles: klines1m } = useKlineData("1m", symbol);

  /* Merge kline price if WebSocket price is stale */
  const data: BinanceData = useMemo(() => {
    if (raw.price > 0) return raw;
    if (klines1m.length > 0) {
      const klinePrice = klines1m[klines1m.length - 1].close;
      return { ...raw, price: klinePrice, freshnessStatus: "delayed", isConnected: true, lastUpdated: raw.lastUpdated || Date.now() };
    }
    return raw;
  }, [raw, klines1m]);

  /* Run ms / orderFlow / liquidity with real-time price updates */
  const ms        = useMarketStructure(data.price, symbol);
  const orderFlow = useOrderFlow(data.price, symbol);
  const liquidity = useLiquidityData(symbol, data.price, orderFlow);

  /* Enhanced signal analysis with all available data sources */
  const analysis    = useSignalAnalysis(data, symbol, { orderFlow, liquidity, ms });
  const history     = useSignalHistory(analysis.signal, analysis.totalScore, analysis.qualityLabel, analysis.ready);
  const probability = useProbabilityEngine(analysis, ms, data, orderFlow, history, liquidity);
  const { alerts, stats: alertStats } = useAlerts(analysis, ms, data, probability, ticker);

  const analysisWithMs = useMemo(() => ({ ...analysis, ms }), [analysis, ms]);

  return useMemo(
    () => ({ data, analysis: analysisWithMs, ms, history, orderFlow, liquidity, probability, alerts, alertStats }),
    [data, analysisWithMs, ms, history, orderFlow, liquidity, probability, alerts, alertStats],
  );
}

/* ── Multi-coin context ─────────────────────────────────────────── */

export type AllEngines = Record<CoinSymbol, CoinEngine>;

const EMPTY_ALL: AllEngines = {
  BTCUSDT: EMPTY_ENGINE,
  ETHUSDT: EMPTY_ENGINE,
  SOLUSDT: EMPTY_ENGINE,
  XRPUSDT: EMPTY_ENGINE,
};

const MultiCoinContext = createContext<AllEngines>(EMPTY_ALL);

/* ── Trading context (active coin) ─────────────────────────────── */

const TradingContext = createContext<CoinEngine>(EMPTY_ENGINE);

/* ── Provider ───────────────────────────────────────────────────── */

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const { selectedCoin } = useSelectedCoin();

  /* Run all 4 engines in parallel — hooks must be called unconditionally */
  const btc = useCoinEngine("BTCUSDT");
  const eth = useCoinEngine("ETHUSDT");
  const sol = useCoinEngine("SOLUSDT");
  const xrp = useCoinEngine("XRPUSDT");

  const allEngines: AllEngines = useMemo(
    () => ({ BTCUSDT: btc, ETHUSDT: eth, SOLUSDT: sol, XRPUSDT: xrp }),
    [btc, eth, sol, xrp],
  );

  const activeEngine = allEngines[selectedCoin];

  return (
    <MultiCoinContext.Provider value={allEngines}>
      <TradingContext.Provider value={activeEngine}>
        {children}
      </TradingContext.Provider>
    </MultiCoinContext.Provider>
  );
}

/* ── Hooks ──────────────────────────────────────────────────────── */

export function useTradingData(): CoinEngine {
  return useContext(TradingContext);
}

export function useMultiCoinData(): AllEngines {
  return useContext(MultiCoinContext);
}
