import { useCallback, useEffect, useRef, useState } from "react";

import type { CoinSymbol } from "@/constants/coins";
import type { OrderFlowData } from "./useOrderFlow";

/* ── Types ─────────────────────────────────────────────────────── */

export interface LiquidityWall {
  price: number;
  sizeUSD: number;
  size: number;
  distancePct: number;
}

export interface LiquidityZone {
  price: number;
  sizeUSD: number;
  strength: "Weak" | "Moderate" | "Strong";
  type: "Support" | "Resistance";
  distancePct: number;
}

export interface LiquidityPressure {
  buyingPressure: number;
  sellingPressure: number;
  direction: "Increasing" | "Decreasing" | "Neutral";
  strength: "Weak" | "Moderate" | "Strong";
  trend: "Bullish" | "Bearish" | "Neutral";
}

export interface LiquidityData {
  largestBidWall: LiquidityWall;
  largestAskWall: LiquidityWall;
  nearestSupportLiquidity: LiquidityWall;
  nearestResistanceLiquidity: LiquidityWall;
  liquidityImbalance: number;
  imbalanceBias: "Bid Heavy" | "Ask Heavy" | "Balanced";
  totalBidUSD: number;
  totalAskUSD: number;

  strongSupport: LiquidityZone | null;
  strongResistance: LiquidityZone | null;
  liquidityClusters: LiquidityZone[];

  pressure: LiquidityPressure;

  liquidityScore: number;
  liquidityBias: "Bullish" | "Bearish" | "Neutral";
  liquidityStrength: "Weak" | "Moderate" | "Strong";

  explanation: string;
  explanationBullets: string[];

  ready: boolean;
  lastUpdated: number;

  /* Future-ready placeholder fields — not yet implemented */
  _future: {
    footprint: null;
    cvd: null;
    absorptionDetection: null;
    volumeProfile: null;
    liquidationClusters: null;
    domAnalysis: null;
  };
}

/* ── Constants ──────────────────────────────────────────────────── */

const FUTURES_REST = "https://fapi.binance.com";
const POLL_MS = 5_000;
const DEPTH_LIMIT = 100;

const EMPTY_WALL: LiquidityWall = { price: 0, sizeUSD: 0, size: 0, distancePct: 0 };
const FUTURE_READY = {
  footprint: null,
  cvd: null,
  absorptionDetection: null,
  volumeProfile: null,
  liquidationClusters: null,
  domAnalysis: null,
} as const;

const EMPTY: LiquidityData = {
  largestBidWall: EMPTY_WALL,
  largestAskWall: EMPTY_WALL,
  nearestSupportLiquidity: EMPTY_WALL,
  nearestResistanceLiquidity: EMPTY_WALL,
  liquidityImbalance: 1,
  imbalanceBias: "Balanced",
  totalBidUSD: 0,
  totalAskUSD: 0,
  strongSupport: null,
  strongResistance: null,
  liquidityClusters: [],
  pressure: {
    buyingPressure: 50,
    sellingPressure: 50,
    direction: "Neutral",
    strength: "Weak",
    trend: "Neutral",
  },
  liquidityScore: 50,
  liquidityBias: "Neutral",
  liquidityStrength: "Weak",
  explanation: "Loading liquidity data…",
  explanationBullets: [],
  ready: false,
  lastUpdated: 0,
  _future: FUTURE_READY,
};

/* ── Helpers ────────────────────────────────────────────────────── */

type RawLevel = [string, string]; // [price, qty]

interface ParsedLevel {
  price: number;
  size: number;
  sizeUSD: number;
}

function parseLevels(raw: RawLevel[], refPrice: number): ParsedLevel[] {
  return raw
    .map(([p, q]) => {
      const price = parseFloat(p);
      const size = parseFloat(q);
      return { price, size, sizeUSD: price * size };
    })
    .filter((l) => l.price > 0 && l.size > 0 && refPrice > 0);
}

/* Cluster consecutive levels into price buckets within `thresholdPct` of each other */
interface Cluster {
  centerPrice: number;
  totalUSD: number;
  totalSize: number;
  levelCount: number;
}

function clusterLevels(levels: ParsedLevel[], thresholdPct: number): Cluster[] {
  if (levels.length === 0) return [];
  const clusters: Cluster[] = [];
  let cur: Cluster = {
    centerPrice: levels[0].price,
    totalUSD: levels[0].sizeUSD,
    totalSize: levels[0].size,
    levelCount: 1,
  };

  for (let i = 1; i < levels.length; i++) {
    const l = levels[i];
    const diff = Math.abs(l.price - cur.centerPrice) / cur.centerPrice;
    if (diff <= thresholdPct) {
      cur.totalUSD += l.sizeUSD;
      cur.totalSize += l.size;
      cur.centerPrice = (cur.centerPrice * cur.levelCount + l.price) / (cur.levelCount + 1);
      cur.levelCount++;
    } else {
      clusters.push(cur);
      cur = { centerPrice: l.price, totalUSD: l.sizeUSD, totalSize: l.size, levelCount: 1 };
    }
  }
  clusters.push(cur);
  return clusters;
}

function strengthFromPct(usd: number, maxUSD: number): "Weak" | "Moderate" | "Strong" {
  const ratio = maxUSD > 0 ? usd / maxUSD : 0;
  if (ratio >= 0.6) return "Strong";
  if (ratio >= 0.3) return "Moderate";
  return "Weak";
}

/* ── Core computation ────────────────────────────────────────────── */

function compute(
  bids: RawLevel[],
  asks: RawLevel[],
  price: number,
  orderFlow: OrderFlowData,
  prevImbalance: number,
): LiquidityData {
  if (price <= 0) return EMPTY;

  const parsedBids = parseLevels(bids, price);
  const parsedAsks = parseLevels(asks, price);
  if (parsedBids.length === 0 || parsedAsks.length === 0) return EMPTY;

  /* ── Totals ─────────────────────────────────────────────────── */
  const totalBidUSD = parsedBids.reduce((s, l) => s + l.sizeUSD, 0);
  const totalAskUSD = parsedAsks.reduce((s, l) => s + l.sizeUSD, 0);
  const liquidityImbalance = totalAskUSD > 0 ? totalBidUSD / totalAskUSD : 1;
  const imbalanceBias: "Bid Heavy" | "Ask Heavy" | "Balanced" =
    liquidityImbalance > 1.15 ? "Bid Heavy" :
    liquidityImbalance < 0.85 ? "Ask Heavy" : "Balanced";

  /* ── Largest walls (max single cluster on each side) ─────────── */
  const clusterThreshold = price > 10000 ? 0.002 : price > 100 ? 0.003 : 0.005;
  const bidClusters = clusterLevels([...parsedBids].sort((a, b) => b.price - a.price), clusterThreshold);
  const askClusters = clusterLevels([...parsedAsks].sort((a, b) => a.price - b.price), clusterThreshold);

  const sortedBidClusters = [...bidClusters].sort((a, b) => b.totalUSD - a.totalUSD);
  const sortedAskClusters = [...askClusters].sort((a, b) => b.totalUSD - a.totalUSD);

  const topBidCluster = sortedBidClusters[0];
  const topAskCluster = sortedAskClusters[0];

  const largestBidWall: LiquidityWall = topBidCluster ? {
    price: topBidCluster.centerPrice,
    sizeUSD: topBidCluster.totalUSD,
    size: topBidCluster.totalSize,
    distancePct: Math.abs((price - topBidCluster.centerPrice) / price) * 100,
  } : EMPTY_WALL;

  const largestAskWall: LiquidityWall = topAskCluster ? {
    price: topAskCluster.centerPrice,
    sizeUSD: topAskCluster.totalUSD,
    size: topAskCluster.totalSize,
    distancePct: Math.abs((topAskCluster.centerPrice - price) / price) * 100,
  } : EMPTY_WALL;

  /* ── Nearest support/resistance (closest cluster with decent size) */
  const avgBidUSD = totalBidUSD / (bidClusters.length || 1);
  const avgAskUSD = totalAskUSD / (askClusters.length || 1);

  const bidsByDist = [...bidClusters]
    .filter((c) => c.totalUSD >= avgBidUSD * 0.5)
    .sort((a, b) => Math.abs(a.centerPrice - price) - Math.abs(b.centerPrice - price));
  const asksByDist = [...askClusters]
    .filter((c) => c.totalUSD >= avgAskUSD * 0.5)
    .sort((a, b) => Math.abs(a.centerPrice - price) - Math.abs(b.centerPrice - price));

  const nearBid = bidsByDist[0];
  const nearAsk = asksByDist[0];

  const nearestSupportLiquidity: LiquidityWall = nearBid ? {
    price: nearBid.centerPrice,
    sizeUSD: nearBid.totalUSD,
    size: nearBid.totalSize,
    distancePct: Math.abs((price - nearBid.centerPrice) / price) * 100,
  } : EMPTY_WALL;

  const nearestResistanceLiquidity: LiquidityWall = nearAsk ? {
    price: nearAsk.centerPrice,
    sizeUSD: nearAsk.totalUSD,
    size: nearAsk.totalSize,
    distancePct: Math.abs((nearAsk.centerPrice - price) / price) * 100,
  } : EMPTY_WALL;

  /* ── Liquidity zones (top clusters classified by strength) ────── */
  const maxBidUSD = sortedBidClusters[0]?.totalUSD ?? 1;
  const maxAskUSD = sortedAskClusters[0]?.totalUSD ?? 1;

  const supportZones: LiquidityZone[] = sortedBidClusters.slice(0, 5).map((c) => ({
    price: c.centerPrice,
    sizeUSD: c.totalUSD,
    strength: strengthFromPct(c.totalUSD, maxBidUSD),
    type: "Support" as const,
    distancePct: Math.abs((price - c.centerPrice) / price) * 100,
  }));

  const resistanceZones: LiquidityZone[] = sortedAskClusters.slice(0, 5).map((c) => ({
    price: c.centerPrice,
    sizeUSD: c.totalUSD,
    strength: strengthFromPct(c.totalUSD, maxAskUSD),
    type: "Resistance" as const,
    distancePct: Math.abs((c.centerPrice - price) / price) * 100,
  }));

  const strongSupport = supportZones.find((z) => z.strength === "Strong") ?? null;
  const strongResistance = resistanceZones.find((z) => z.strength === "Strong") ?? null;

  /* Interleave support and resistance clusters sorted by distance */
  const liquidityClusters: LiquidityZone[] = [...supportZones, ...resistanceZones]
    .filter((z) => z.strength !== "Weak")
    .sort((a, b) => a.distancePct - b.distancePct)
    .slice(0, 6);

  /* ── Market pressure (from real orderFlow + order book imbalance) */
  const buyingPressure = orderFlow.ready
    ? Math.round((orderFlow.buyerAggression * 0.6 + (liquidityImbalance / (liquidityImbalance + 1)) * 100 * 0.4))
    : Math.round((liquidityImbalance / (liquidityImbalance + 1)) * 100);

  const sellingPressure = 100 - buyingPressure;

  const pressureDirection: "Increasing" | "Decreasing" | "Neutral" =
    liquidityImbalance > prevImbalance + 0.05 ? "Increasing" :
    liquidityImbalance < prevImbalance - 0.05 ? "Decreasing" : "Neutral";

  const pressureDiff = Math.abs(buyingPressure - sellingPressure);
  const pressureStrength: "Weak" | "Moderate" | "Strong" =
    pressureDiff > 25 ? "Strong" : pressureDiff > 10 ? "Moderate" : "Weak";

  const pressureTrend: "Bullish" | "Bearish" | "Neutral" =
    buyingPressure > 58 ? "Bullish" : buyingPressure < 42 ? "Bearish" : "Neutral";

  const pressure: LiquidityPressure = {
    buyingPressure,
    sellingPressure,
    direction: pressureDirection,
    strength: pressureStrength,
    trend: pressureTrend,
  };

  /* ── Liquidity score (0–100) ─────────────────────────────────── */
  /* Components: order book imbalance (50%), buying pressure (30%), wall proximity (20%) */
  const imbalanceScore = Math.min(100, Math.max(0,
    liquidityImbalance > 1 ? 50 + Math.min(50, (liquidityImbalance - 1) * 100) :
                              50 - Math.min(50, (1 - liquidityImbalance) * 100)
  ));
  const pressureScore = buyingPressure;
  /* Wall proximity: closer bid wall relative to ask = bullish (0–100) */
  const bidDist = largestBidWall.distancePct || 5;
  const askDist = largestAskWall.distancePct || 5;
  const wallProxScore = Math.min(100, Math.max(0, 50 + (askDist - bidDist) * 10));

  const liquidityScore = Math.round(
    imbalanceScore * 0.5 + pressureScore * 0.3 + wallProxScore * 0.2,
  );

  const liquidityBias: "Bullish" | "Bearish" | "Neutral" =
    liquidityScore >= 58 ? "Bullish" : liquidityScore <= 42 ? "Bearish" : "Neutral";

  const liquidityStrength: "Weak" | "Moderate" | "Strong" =
    Math.abs(liquidityScore - 50) > 20 ? "Strong" :
    Math.abs(liquidityScore - 50) > 8  ? "Moderate" : "Weak";

  /* ── Plain language explanation ─────────────────────────────── */
  const bullets: string[] = [];

  if (imbalanceBias === "Bid Heavy")
    bullets.push("Strong bid support — buyers defending price below current level");
  else if (imbalanceBias === "Ask Heavy")
    bullets.push("Heavy ask pressure — sellers stacked above current price");
  else
    bullets.push("Order book is balanced between buyers and sellers");

  if (strongSupport)
    bullets.push(`Strong support zone at $${Math.round(strongSupport.price).toLocaleString()} (${strongSupport.distancePct.toFixed(2)}% below)`);
  if (strongResistance)
    bullets.push(`Strong resistance zone at $${Math.round(strongResistance.price).toLocaleString()} (${strongResistance.distancePct.toFixed(2)}% above)`);

  if (pressure.trend === "Bullish")
    bullets.push(`Buying pressure is ${pressure.direction === "Increasing" ? "increasing" : "dominant"} — ${pressure.strength.toLowerCase()} bullish momentum`);
  else if (pressure.trend === "Bearish")
    bullets.push(`Selling pressure is ${pressure.direction === "Decreasing" ? "building" : "dominant"} — ${pressure.strength.toLowerCase()} bearish momentum`);

  if (liquidityBias === "Bullish")
    bullets.push("Liquidity conditions support bullish continuation");
  else if (liquidityBias === "Bearish")
    bullets.push("Liquidity conditions favor bearish continuation");
  else
    bullets.push("Liquidity conditions are neutral — await directional confirmation");

  const explanation = bullets[0] ?? "Analyzing order book…";

  return {
    largestBidWall,
    largestAskWall,
    nearestSupportLiquidity,
    nearestResistanceLiquidity,
    liquidityImbalance,
    imbalanceBias,
    totalBidUSD,
    totalAskUSD,
    strongSupport,
    strongResistance,
    liquidityClusters,
    pressure,
    liquidityScore,
    liquidityBias,
    liquidityStrength,
    explanation,
    explanationBullets: bullets.slice(0, 5),
    ready: true,
    lastUpdated: Date.now(),
    _future: FUTURE_READY,
  };
}

/* ── Hook ──────────────────────────────────────────────────────── */

export function useLiquidityData(
  symbol: CoinSymbol,
  price: number,
  orderFlow: OrderFlowData,
): LiquidityData {
  const [data, setData] = useState<LiquidityData>(EMPTY);
  const prevImbalance = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dead = useRef(false);

  const fetch_ = useCallback(async () => {
    if (dead.current || price <= 0) return;
    try {
      const res = await fetch(
        `${FUTURES_REST}/fapi/v1/depth?symbol=${symbol}&limit=${DEPTH_LIMIT}`,
      );
      if (!res.ok) return;
      const json = await res.json() as { bids: RawLevel[]; asks: RawLevel[] };
      const result = compute(json.bids, json.asks, price, orderFlow, prevImbalance.current);
      prevImbalance.current = result.liquidityImbalance;
      if (!dead.current) setData(result);
    } catch {
      /* silently retry */
    }
  }, [symbol, price, orderFlow]);

  useEffect(() => {
    dead.current = false;
    prevImbalance.current = 1;

    const loop = () => {
      if (dead.current) return;
      fetch_().finally(() => {
        if (!dead.current) timer.current = setTimeout(loop, POLL_MS);
      });
    };
    loop();

    return () => {
      dead.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetch_]);

  return data;
}
