import { useCallback, useEffect, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export type TrendDir   = "Increasing" | "Decreasing" | "Stable";
export type Strength   = "Weak" | "Moderate" | "Strong";
export type FlowBias   = "Bullish" | "Bearish" | "Neutral";
export type DataSource = "websocket" | "klines" | "loading";
export type AlertType  =
  | "aggressive_buying"
  | "aggressive_selling"
  | "delta_shift"
  | "pressure_shift"
  | "strong_buy_imbalance"
  | "strong_sell_imbalance"
  | "reversal";
export type AlertSeverity = "low" | "medium" | "high";

export interface AggressionMetric {
  value: number;
  trend: TrendDir;
  strength: Strength;
}

export interface DeltaAnalysis {
  current: number;
  currentUSD: number;
  trend: FlowBias;
  strength: Strength;
  history: number[];
}

export interface TradePressure {
  buying: number;
  selling: number;
  trend: TrendDir;
  strength: Strength;
}

export interface VolumeImbalanceData {
  buyPct: number;
  sellPct: number;
  imbalance: number;
  bias: "Buy Imbalance" | "Sell Imbalance" | "Balanced";
  strength: Strength;
}

export interface OrderFlowScore {
  score: number;
  bias: FlowBias;
  strength: Strength;
}

export interface OrderFlowAlert {
  id: string;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  timestamp: number;
}

export interface OrderFlowData {
  /* Legacy fields — preserved for backward-compat */
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

  /* Enhanced real-time fields */
  buyerAggressionMetric: AggressionMetric;
  sellerAggressionMetric: AggressionMetric;
  deltaAnalysis: DeltaAnalysis;
  tradePressure: TradePressure;
  volumeImbalanceData: VolumeImbalanceData;
  score: OrderFlowScore;
  alerts: OrderFlowAlert[];
  marketExplanation: string;
  tradeCount: number;
  tradesPerSecond: number;
  dataSource: DataSource;
  lastTradeTime: number;
  bidAskRatio: number;
  totalBidDepthUSD: number;
  totalAskDepthUSD: number;

  _future: {
    cvd: null;
    footprint: null;
    volumeProfile: null;
    absorptionDetection: null;
    liquiditySweeps: null;
    domAnalysis: null;
    liquidationClusters: null;
  };
}

/* ── Trade buffer ──────────────────────────────────────────────────── */

interface TradeEntry {
  time: number;
  buyVol: number;
  sellVol: number;
  price: number;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const WINDOW_MS  = 120_000;   // 2-min rolling window for buffer
const CURR_MS    = 30_000;    // "current" = last 30 seconds
const PREV_MS    = 90_000;    // "previous" = 30-120 seconds ago
const MAX_ALERTS = 20;
const ALERT_COOLDOWN_MS: Record<AlertType, number> = {
  aggressive_buying:       30_000,
  aggressive_selling:      30_000,
  delta_shift:             20_000,
  pressure_shift:          25_000,
  strong_buy_imbalance:    15_000,
  strong_sell_imbalance:   15_000,
  reversal:                45_000,
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function strength(pct: number): Strength {
  if (pct >= 65) return "Strong";
  if (pct >= 55) return "Moderate";
  return "Weak";
}

function trend(curr: number, prev: number, threshold = 3): TrendDir {
  if (curr - prev > threshold) return "Increasing";
  if (prev - curr > threshold) return "Decreasing";
  return "Stable";
}

function flowBias(delta: number, totalVol: number): FlowBias {
  if (!totalVol) return "Neutral";
  const pct = (delta / totalVol) * 100;
  if (pct > 4) return "Bullish";
  if (pct < -4) return "Bearish";
  return "Neutral";
}

function computeScore(buyPct: number, deltaPct: number, bidAskRatio: number): OrderFlowScore {
  let score = 50;
  score += (buyPct - 50) * 0.8;
  score += clamp(deltaPct * 1.5, -15, 15);
  if (bidAskRatio > 1.3) score += 5;
  else if (bidAskRatio < 0.77) score -= 5;
  score = Math.round(clamp(score, 0, 100));
  const bias: FlowBias = score > 56 ? "Bullish" : score < 44 ? "Bearish" : "Neutral";
  const str: Strength  = Math.abs(score - 50) > 20 ? "Strong" : Math.abs(score - 50) > 10 ? "Moderate" : "Weak";
  return { score, bias, strength: str };
}

function computeEnvironment(buyPct: number, totalVol: number, avgVol: number): string {
  const highVol = totalVol > avgVol * 1.3;
  const lowVol  = totalVol < avgVol * 0.7;
  if (highVol && buyPct > 55) return "High-volume bullish momentum";
  if (highVol && buyPct < 45) return "High-volume bearish momentum";
  if (highVol) return "High-volume consolidation";
  if (lowVol) return "Low-volume range / accumulation";
  return "Normal market conditions";
}

function computeSummary(buyPct: number): string {
  if (buyPct > 65) return "Buyers are aggressively lifting offers — strong bullish order flow.";
  if (buyPct > 55) return "Buyers are in control with moderate bullish pressure.";
  if (buyPct > 52) return "Mild buyer edge — flow leaning slightly bullish.";
  if (buyPct < 35) return "Sellers are aggressively hitting bids — strong bearish order flow.";
  if (buyPct < 45) return "Sellers are in control with moderate bearish pressure.";
  if (buyPct < 48) return "Mild seller edge — flow leaning slightly bearish.";
  return "Order flow is balanced — neither buyers nor sellers dominate.";
}

function computeExplanation(score: OrderFlowScore, buyPct: number, deltaBias: FlowBias, prevBuyPct: number, tps: number): string {
  const lines: string[] = [];
  const dir = score.bias;

  if (dir === "Bullish") {
    if (buyPct > 60) lines.push("Buyers are aggressively lifting offers.");
    else lines.push("Buyers have a moderate edge in the tape.");
    if (deltaBias === "Bullish") lines.push("Positive delta is expanding — net buying pressure is increasing.");
    if (buyPct > prevBuyPct + 5) lines.push("Buyer aggression is increasing this window.");
    lines.push("Order flow currently supports bullish continuation.");
    if (score.strength === "Strong") lines.push("Momentum is strong — sellers are unable to absorb the buying.");
    else lines.push("Momentum is moderate — watch for absorption near resistance.");
  } else if (dir === "Bearish") {
    if (buyPct < 40) lines.push("Sellers are aggressively hitting bids.");
    else lines.push("Sellers have a moderate edge in the tape.");
    if (deltaBias === "Bearish") lines.push("Negative delta is deepening — net selling pressure is increasing.");
    if (buyPct < prevBuyPct - 5) lines.push("Seller aggression is increasing this window.");
    lines.push("Order flow currently supports bearish continuation.");
    if (score.strength === "Strong") lines.push("Downside momentum is strong — buyers are unable to halt the selling.");
    else lines.push("Momentum is moderate — watch for absorption near support.");
  } else {
    lines.push("Order flow is balanced between buyers and sellers.");
    lines.push("Neither side has a dominant edge at this time.");
    if (tps > 10) lines.push("Volume is elevated but no directional bias is present — possible accumulation or distribution.");
    else lines.push("Low trade activity — market is in a wait-and-see mode.");
  }

  return lines.join(" ");
}

function generateAlerts(
  curr: { buyPct: number; deltaPct: number; totalVol: number },
  prev: { buyPct: number; deltaPct: number },
  lastAlertTime: { current: Partial<Record<AlertType, number>> },
  existingAlerts: OrderFlowAlert[],
): OrderFlowAlert[] {
  const now = Date.now();
  const newAlerts: OrderFlowAlert[] = [];

  const canAlert = (type: AlertType) => {
    const last = lastAlertTime.current[type] ?? 0;
    return now - last > (ALERT_COOLDOWN_MS[type] ?? 15_000);
  };

  const push = (type: AlertType, message: string, severity: AlertSeverity) => {
    if (!canAlert(type)) return;
    lastAlertTime.current[type] = now;
    newAlerts.push({ id: `${type}_${now}`, type, message, severity, timestamp: now });
  };

  if (curr.buyPct > 68 && canAlert("aggressive_buying"))
    push("aggressive_buying", `Aggressive buying detected — ${curr.buyPct}% taker buy ratio.`, curr.buyPct > 75 ? "high" : "medium");

  if (curr.buyPct < 32 && canAlert("aggressive_selling"))
    push("aggressive_selling", `Aggressive selling detected — ${(100 - curr.buyPct)}% taker sell ratio.`, curr.buyPct < 25 ? "high" : "medium");

  const deltaShift = curr.deltaPct - prev.deltaPct;
  if (Math.abs(deltaShift) > 8 && canAlert("delta_shift"))
    push("delta_shift", `Delta shifted ${deltaShift > 0 ? "+" : ""}${deltaShift.toFixed(1)}% — ${deltaShift > 0 ? "buyers accelerating" : "sellers accelerating"}.`, Math.abs(deltaShift) > 15 ? "high" : "medium");

  const pressureShift = curr.buyPct - prev.buyPct;
  if (Math.abs(pressureShift) > 10 && canAlert("pressure_shift"))
    push("pressure_shift", `Pressure shift: ${pressureShift > 0 ? "buyers" : "sellers"} gained ${Math.abs(pressureShift).toFixed(0)}% in 60s.`, "medium");

  if (curr.buyPct > 62 && canAlert("strong_buy_imbalance"))
    push("strong_buy_imbalance", `Strong buy imbalance — ${curr.buyPct}% buy / ${100 - curr.buyPct}% sell.`, "low");

  if (curr.buyPct < 38 && canAlert("strong_sell_imbalance"))
    push("strong_sell_imbalance", `Strong sell imbalance — ${100 - curr.buyPct}% sell / ${curr.buyPct}% buy.`, "low");

  if (curr.buyPct > 55 && prev.buyPct < 45 && canAlert("reversal"))
    push("reversal", `Order flow reversal: bias flipped from bearish to bullish in 60s.`, "high");
  else if (curr.buyPct < 45 && prev.buyPct > 55 && canAlert("reversal"))
    push("reversal", `Order flow reversal: bias flipped from bullish to bearish in 60s.`, "high");

  const all = [...newAlerts, ...existingAlerts].slice(0, MAX_ALERTS);
  return all;
}

/* ── Order Book Fetch ──────────────────────────────────────────────── */

interface OrderBookResult {
  totalBidUSD: number;
  totalAskUSD: number;
  bidAskRatio: number;
}

async function fetchOrderBook(symbol: string, price: number): Promise<OrderBookResult> {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=20`);
    if (!res.ok) return { totalBidUSD: 0, totalAskUSD: 0, bidAskRatio: 1 };
    const data = (await res.json()) as { bids: string[][]; asks: string[][] };
    const p = price || 1;
    const totalBidUSD = (data.bids ?? []).reduce((s, [pr, sz]) => s + parseFloat(pr) * parseFloat(sz), 0);
    const totalAskUSD = (data.asks ?? []).reduce((s, [pr, sz]) => s + parseFloat(pr) * parseFloat(sz), 0);
    const bidAskRatio = totalAskUSD > 0 ? totalBidUSD / totalAskUSD : 1;
    return { totalBidUSD, totalAskUSD, bidAskRatio };
  } catch {
    return { totalBidUSD: 0, totalAskUSD: 0, bidAskRatio: 1 };
  }
}

/* ── Kline Fallback ────────────────────────────────────────────────── */

async function fetchKlinesFallback(symbol: string): Promise<{ buyPct: number; totalVol: number; avgVol: number; delta: number }> {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=15`);
    if (!res.ok) return { buyPct: 50, totalVol: 0, avgVol: 0, delta: 0 };
    const raw: unknown[][] = await res.json();
    const klines = raw.map((k) => ({
      volume: parseFloat(k[5] as string),
      takerBuyVolume: parseFloat(k[9] as string),
    }));
    const recent = klines.slice(-4, -1);
    const totalVol = recent.reduce((s, k) => s + k.volume, 0);
    const buyVol   = recent.reduce((s, k) => s + k.takerBuyVolume, 0);
    const allVols  = klines.map((k) => k.volume);
    const avgVol   = allVols.reduce((a, b) => a + b, 0) / allVols.length;
    const buyPct   = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
    const delta    = buyVol - (totalVol - buyVol);
    return { buyPct, totalVol, avgVol, delta };
  } catch {
    return { buyPct: 50, totalVol: 0, avgVol: 0, delta: 0 };
  }
}

/* ── Default empty state ───────────────────────────────────────────── */

const EMPTY_METRIC: AggressionMetric = { value: 0, trend: "Stable", strength: "Weak" };
const EMPTY_DELTA: DeltaAnalysis     = { current: 0, currentUSD: 0, trend: "Neutral", strength: "Weak", history: [] };
const EMPTY_PRESSURE: TradePressure  = { buying: 0, selling: 0, trend: "Stable", strength: "Weak" };
const EMPTY_VIB: VolumeImbalanceData = { buyPct: 50, sellPct: 50, imbalance: 0, bias: "Balanced", strength: "Weak" };
const EMPTY_SCORE: OrderFlowScore    = { score: 50, bias: "Neutral", strength: "Weak" };

const EMPTY: OrderFlowData = {
  buyerAggression: 0, sellerAggression: 0, delta: 0, deltaUSD: 0,
  volumeImbalance: 0, buyingPressure: 0, sellingPressure: 0,
  totalVolume: 0, buyVolume: 0, sellVolume: 0,
  summary: "Connecting to trade stream…", environment: "—", ready: false,
  buyerAggressionMetric: EMPTY_METRIC,
  sellerAggressionMetric: EMPTY_METRIC,
  deltaAnalysis: EMPTY_DELTA,
  tradePressure: EMPTY_PRESSURE,
  volumeImbalanceData: EMPTY_VIB,
  score: EMPTY_SCORE,
  alerts: [],
  marketExplanation: "Waiting for trade data…",
  tradeCount: 0,
  tradesPerSecond: 0,
  dataSource: "loading",
  lastTradeTime: 0,
  bidAskRatio: 1,
  totalBidDepthUSD: 0,
  totalAskDepthUSD: 0,
  _future: { cvd: null, footprint: null, volumeProfile: null, absorptionDetection: null, liquiditySweeps: null, domAnalysis: null, liquidationClusters: null },
};

/* ── Main Hook ─────────────────────────────────────────────────────── */

export function useOrderFlow(price: number, symbol: string = "BTCUSDT"): OrderFlowData {
  const [data, setData] = useState<OrderFlowData>(EMPTY);

  /* Refs — avoid stale closures */
  const priceRef     = useRef(price);
  const symbolRef    = useRef(symbol);
  const tradeBuffer  = useRef<TradeEntry[]>([]);
  const lastAlertTime = useRef<Partial<Record<AlertType, number>>>({});
  const alertsRef    = useRef<OrderFlowAlert[]>([]);
  const mountedRef   = useRef(true);
  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const obRef        = useRef<OrderBookResult>({ totalBidUSD: 0, totalAskUSD: 0, bidAskRatio: 1 });
  const wsActiveRef  = useRef(false);
  const deltaHistRef = useRef<number[]>([]);

  priceRef.current  = price;
  symbolRef.current = symbol;

  /* ── Compute and push state from current buffer ─────────────────── */
  const recompute = useCallback(() => {
    if (!mountedRef.current) return;
    const now = Date.now();

    /* Trim buffer to window */
    tradeBuffer.current = tradeBuffer.current.filter((t) => t.time > now - WINDOW_MS);

    const currTrades = tradeBuffer.current.filter((t) => t.time > now - CURR_MS);
    const prevTrades = tradeBuffer.current.filter((t) => t.time > now - PREV_MS && t.time <= now - CURR_MS);

    const sumVol  = (arr: TradeEntry[]) => ({ buy: arr.reduce((s, t) => s + t.buyVol, 0), sell: arr.reduce((s, t) => s + t.sellVol, 0) });
    const cv = sumVol(currTrades);
    const pv = sumVol(prevTrades);

    const cTotal = cv.buy + cv.sell;
    const pTotal = pv.buy + pv.sell;

    const cBuyPct = cTotal > 0 ? (cv.buy / cTotal) * 100 : 50;
    const pBuyPct = pTotal > 0 ? (pv.buy / pTotal) * 100 : 50;

    const cDelta = cv.buy - cv.sell;
    const pDelta = pv.buy - pv.sell;
    const cDeltaPct = cTotal > 0 ? (cDelta / cTotal) * 100 : 0;
    const pDeltaPct = pTotal > 0 ? (pDelta / pTotal) * 100 : 0;

    /* Delta history (keep last 10 readings) */
    deltaHistRef.current = [...deltaHistRef.current.slice(-9), cDelta];

    const p = priceRef.current || 1;
    const tps = currTrades.length / (CURR_MS / 1000);
    const ob  = obRef.current;

    /* ── Score ── */
    const sc = computeScore(cBuyPct, cDeltaPct, ob.bidAskRatio);

    /* ── Metrics ── */
    const buyPctR = Math.round(cBuyPct);
    const sellPctR = 100 - buyPctR;

    const buyMetric: AggressionMetric = {
      value: buyPctR,
      trend: trend(cBuyPct, pBuyPct),
      strength: strength(cBuyPct),
    };
    const sellMetric: AggressionMetric = {
      value: sellPctR,
      trend: trend(100 - cBuyPct, 100 - pBuyPct),
      strength: strength(100 - cBuyPct),
    };

    /* ── Delta ── */
    const dA: DeltaAnalysis = {
      current: cDelta,
      currentUSD: cDelta * p,
      trend: flowBias(cDelta, cTotal),
      strength: cTotal > 0 ? strength(clamp(50 + Math.abs(cDeltaPct) * 2, 0, 100)) : "Weak",
      history: [...deltaHistRef.current],
    };

    /* ── Pressure ── */
    const buyPressure  = Math.round(clamp(cBuyPct * 1.2, 0, 100));
    const sellPressure = Math.round(clamp((100 - cBuyPct) * 1.2, 0, 100));
    const pressTrend   = trend(buyPressure, Math.round(clamp(pBuyPct * 1.2, 0, 100)));
    const tp: TradePressure = {
      buying: buyPressure, selling: sellPressure,
      trend: pressTrend,
      strength: strength(Math.max(buyPressure, sellPressure)),
    };

    /* ── Volume Imbalance ── */
    const imbalancePct = cTotal > 0 ? Math.round(((cv.buy - cv.sell) / cTotal) * 100) : 0;
    const vib: VolumeImbalanceData = {
      buyPct: buyPctR, sellPct: sellPctR, imbalance: imbalancePct,
      bias: Math.abs(imbalancePct) < 5 ? "Balanced" : imbalancePct > 0 ? "Buy Imbalance" : "Sell Imbalance",
      strength: strength(50 + Math.abs(imbalancePct) * 0.8),
    };

    /* ── Alerts ── */
    const newAlerts = generateAlerts(
      { buyPct: buyPctR, deltaPct: cDeltaPct, totalVol: cTotal },
      { buyPct: Math.round(pBuyPct), deltaPct: pDeltaPct },
      lastAlertTime,
      alertsRef.current,
    );
    alertsRef.current = newAlerts;

    /* ── Explanation ── */
    const explanation = computeExplanation(sc, cBuyPct, dA.trend, pBuyPct, tps);

    setData({
      /* Legacy */
      buyerAggression: buyPctR,
      sellerAggression: sellPctR,
      delta: cDelta,
      deltaUSD: cDelta * p,
      volumeImbalance: imbalancePct,
      buyingPressure: buyPressure,
      sellingPressure: sellPressure,
      totalVolume: cTotal,
      buyVolume: cv.buy,
      sellVolume: cv.sell,
      summary: computeSummary(cBuyPct),
      environment: computeEnvironment(cBuyPct, cTotal, 50),
      ready: true,
      /* Enhanced */
      buyerAggressionMetric: buyMetric,
      sellerAggressionMetric: sellMetric,
      deltaAnalysis: dA,
      tradePressure: tp,
      volumeImbalanceData: vib,
      score: sc,
      alerts: newAlerts,
      marketExplanation: explanation,
      tradeCount: currTrades.length,
      tradesPerSecond: Math.round(tps * 10) / 10,
      dataSource: wsActiveRef.current ? "websocket" : "klines",
      lastTradeTime: currTrades[currTrades.length - 1]?.time ?? 0,
      bidAskRatio: Math.round(ob.bidAskRatio * 100) / 100,
      totalBidDepthUSD: ob.totalBidUSD,
      totalAskDepthUSD: ob.totalAskUSD,
      _future: EMPTY._future,
    });
  }, []);

  /* ── WebSocket connection ────────────────────────────────────────── */
  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    const sym = symbolRef.current.toLowerCase();
    const url = `wss://fstream.binance.com/ws/${sym}@aggTrade`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { wsActiveRef.current = true; };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          if (msg["e"] !== "aggTrade") return;
          const isMakerBuy = msg["m"] as boolean; // true → taker is SELLER
          const qty = parseFloat(msg["q"] as string);
          const px  = parseFloat(msg["p"] as string);
          const tm  = msg["T"] as number;

          tradeBuffer.current.push({
            time: tm,
            buyVol:  isMakerBuy ? 0 : qty,
            sellVol: isMakerBuy ? qty : 0,
            price: px,
          });

          /* Keep buffer from growing unbounded */
          if (tradeBuffer.current.length > 10_000) {
            tradeBuffer.current = tradeBuffer.current.slice(-5_000);
          }
        } catch {}
      };

      ws.onerror = () => { ws.close(); };
      ws.onclose = () => {
        wsActiveRef.current = false;
        wsRef.current = null;
        if (!mountedRef.current) return;
        reconnectRef.current = setTimeout(connectWs, 4_000);
      };
    } catch {
      wsActiveRef.current = false;
      reconnectRef.current = setTimeout(connectWs, 6_000);
    }
  }, []);

  /* ── Main effect: symbol/price changes ─────────────────────────── */
  useEffect(() => {
    mountedRef.current  = true;
    wsActiveRef.current = false;
    tradeBuffer.current = [];
    alertsRef.current   = [];
    deltaHistRef.current = [];
    setData({ ...EMPTY });

    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }

    /* Start WebSocket */
    connectWs();

    /* Seed with klines while WS warms up */
    fetchKlinesFallback(symbol).then((fb) => {
      if (!mountedRef.current || wsActiveRef.current) return;
      const now = Date.now();
      const p = priceRef.current || 1;
      const fakeBuy  = fb.buyPct / 100 * fb.totalVol;
      const fakeSell = fb.totalVol - fakeBuy;
      /* Insert synthetic "past" trades so recompute has data immediately */
      for (let i = 0; i < 60; i++) {
        tradeBuffer.current.push({ time: now - 25_000 + i * 400, buyVol: fakeBuy / 60, sellVol: fakeSell / 60, price: p });
      }
      recompute();
    });

    /* Order book poll */
    const obPoll = setInterval(async () => {
      if (!mountedRef.current) return;
      const p = priceRef.current;
      const ob = await fetchOrderBook(symbol, p);
      obRef.current = ob;
    }, 5_000);

    /* Recompute every 2 seconds */
    const computeTimer = setInterval(() => {
      if (!mountedRef.current) return;
      recompute();
    }, 2_000);

    return () => {
      mountedRef.current = false;
      clearInterval(obPoll);
      clearInterval(computeTimer);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [symbol, connectWs, recompute]);

  /* Keep price ref current without restarting effect */
  useEffect(() => { priceRef.current = price; }, [price]);

  return data;
}
