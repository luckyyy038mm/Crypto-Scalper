/**
 * Real-Time Data Provider
 * Provides unified real-time data from Binance WebSockets to all components
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TradeEntry {
  time: number;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
  isTakerBuy: boolean; // true = buyer initiated (taker buy)
}

export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  isClosed: boolean;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: number;
}

export interface FundingData {
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
}

export interface TickerData {
  price: number;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  high24h: number;
  low24h: number;
  openPrice: number;
}

export interface RealTimeData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
  openInterest: number;
  high24h: number;
  low24h: number;
  
  // Real-time streams
  trades: TradeEntry[];
  candles: Record<string, CandleData[]>; // keyed by interval
  orderBook: OrderBookSnapshot | null;
  
  // Aggregated metrics
  buyPressure: number;
  sellPressure: number;
  delta: number;
  deltaUSD: number;
  volumeImbalance: number;
  bidDepthUSD: number;
  askDepthUSD: number;
  
  // Connection status
  isConnected: boolean;
  freshnessStatus: "live" | "warning" | "delayed" | "disconnected";
  lastUpdate: number;
}

/* ── Constants ──────────────────────────────────────────────────────── */

const WINDOW_MS = 120_000; // 2-min rolling window for trades
const CURR_MS = 30_000; // Current window
const HIST_LIMITS: Record<string, number> = {
  "1m": 150,
  "5m": 150,
  "15m": 150,
  "1h": 150,
  "4h": 100,
};
const MAX_TRADES = 5000;
const ORDER_BOOK_DEPTH = 100;
const DEBOUNCE_MS = 100;

/* ── Helpers ───────────────────────────────────────────────────────── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function computeBuyPressure(trades: TradeEntry[]): { buyPressure: number; sellPressure: number; delta: number; deltaUSD: number; volumeImbalance: number } {
  const now = Date.now();
  const recent = trades.filter(t => t.time > now - CURR_MS);
  
  if (recent.length === 0) {
    return { buyPressure: 50, sellPressure: 50, delta: 0, deltaUSD: 0, volumeImbalance: 0 };
  }
  
  const totalBuyVol = recent.reduce((s, t) => s + (t.isTakerBuy ? t.quantity : 0), 0);
  const totalSellVol = recent.reduce((s, t) => s + (!t.isTakerBuy ? t.quantity : 0), 0);
  const totalVol = totalBuyVol + totalSellVol;
  
  const buyPct = totalVol > 0 ? (totalBuyVol / totalVol) * 100 : 50;
  const delta = totalBuyVol - totalSellVol;
  const lastPrice = recent[recent.length - 1]?.price || 1;
  
  return {
    buyPressure: Math.round(clamp(buyPct * 1.2, 0, 100)),
    sellPressure: Math.round(clamp((100 - buyPct) * 1.2, 0, 100)),
    delta,
    deltaUSD: delta * lastPrice,
    volumeImbalance: totalVol > 0 ? (delta / totalVol) * 100 : 0,
  };
}

function computeOrderBookDepth(bids: [string, string][], asks: [string, string][], refPrice: number): { bidDepthUSD: number; askDepthUSD: number } {
  const topBids = bids.slice(0, 20);
  const topAsks = asks.slice(0, 20);
  
  const bidDepthUSD = topBids.reduce((s, [p, q]) => s + parseFloat(p) * parseFloat(q), 0);
  const askDepthUSD = topAsks.reduce((s, [p, q]) => s + parseFloat(p) * parseFloat(q), 0);
  
  return { bidDepthUSD, askDepthUSD };
}

/* ── Context ───────────────────────────────────────────────────────── */

interface RealtimeContextValue {
  getData: (symbol: string) => RealTimeData;
  subscribe: (symbol: string, intervals: string[]) => void;
  unsubscribe: (symbol: string) => void;
}

const RealtimeDataContext = createContext<RealtimeContextValue>({
  getData: () => ({
    symbol: "",
    price: 0,
    priceChange: 0,
    priceChangePercent: 0,
    quoteVolume: 0,
    fundingRate: 0,
    markPrice: 0,
    indexPrice: 0,
    nextFundingTime: 0,
    openInterest: 0,
    high24h: 0,
    low24h: 0,
    trades: [],
    candles: {},
    orderBook: null,
    buyPressure: 50,
    sellPressure: 50,
    delta: 0,
    deltaUSD: 0,
    volumeImbalance: 0,
    bidDepthUSD: 0,
    askDepthUSD: 0,
    isConnected: false,
    freshnessStatus: "disconnected",
    lastUpdate: 0,
  }),
  subscribe: () => {},
  unsubscribe: () => {},
});

/* ── Provider ──────────────────────────────────────────────────────── */

const EMPTY_DATA: RealTimeData = {
  symbol: "",
  price: 0,
  priceChange: 0,
  priceChangePercent: 0,
  quoteVolume: 0,
  fundingRate: 0,
  markPrice: 0,
  indexPrice: 0,
  nextFundingTime: 0,
  openInterest: 0,
  high24h: 0,
  low24h: 0,
  trades: [],
  candles: {},
  orderBook: null,
  buyPressure: 50,
  sellPressure: 50,
  delta: 0,
  deltaUSD: 0,
  volumeImbalance: 0,
  bidDepthUSD: 0,
  askDepthUSD: 0,
  isConnected: false,
  freshnessStatus: "disconnected",
  lastUpdate: 0,
};

export function RealTimeDataProvider({ children }: { children: React.ReactNode }) {
  const dataRef = useRef<Map<string, RealTimeData>>(new Map());
  const [dataMap, setDataMap] = useState<Map<string, RealTimeData>>(new Map());
  const subscribersRef = useRef<Map<string, Set<string>>>(new Map());
  const wsRef = useRef<Map<string, WebSocket>>(new Map());
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastUpdateRef = useRef<Map<string, number>>(new Map());

  const updateData = useCallback((symbol: string, updates: Partial<RealTimeData>) => {
    const current = dataRef.current.get(symbol) || { ...EMPTY_DATA, symbol };
    const updated = { ...current, ...updates, lastUpdate: Date.now() };
    
    // Compute aggregated metrics
    if (updated.trades.length > 0) {
      const metrics = computeBuyPressure(updated.trades);
      Object.assign(updated, metrics);
    }
    
    if (updated.orderBook) {
      const depth = computeOrderBookDepth(
        updated.orderBook.bids.map(b => [String(b.price), String(b.quantity)]),
        updated.orderBook.asks.map(a => [String(a.price), String(a.quantity)]),
        updated.price || updated.markPrice || 1
      );
      Object.assign(updated, depth);
    }
    
    // Update freshness
    const age = Date.now() - updated.lastUpdate;
    updated.freshnessStatus = age < 4000 ? "live" : age < 12000 ? "warning" : age < 30000 ? "delayed" : "disconnected";
    updated.isConnected = updated.freshnessStatus !== "disconnected";
    
    dataRef.current.set(symbol, updated);
    lastUpdateRef.current.set(symbol, Date.now());
    
    // Debounce state update
    const existingTimer = debounceTimers.current.get(symbol);
    if (existingTimer) clearTimeout(existingTimer);
    
    debounceTimers.current.set(symbol, setTimeout(() => {
      setDataMap(new Map(dataRef.current));
    }, DEBOUNCE_MS));
  }, []);

  const subscribe = useCallback((symbol: string, intervals: string[] = ["1m", "5m", "15m"]) => {
    if (subscribersRef.current.has(symbol)) return;
    
    subscribersRef.current.set(symbol, new Set(intervals));
    const sym = symbol.toLowerCase();
    
    // Initialize data
    dataRef.current.set(symbol, { ...EMPTY_DATA, symbol });
    
    // 1. Combined WebSocket stream for trades, ticker, markPrice, and klines
    const streams = [
      `${sym}@aggTrade`,           // Aggregated trades
      `${sym}@ticker`,             // 24hr ticker
      `${sym}@markPrice@1s`,       // Mark price
      ...intervals.map(i => `${sym}@kline_${i}`), // Kline/Candle streams
    ].join("/");
    
    const wsUrl = `wss://fstream.binance.com/stream?streams=${streams}`;
    
    let ws: WebSocket | null = null;
    let dead = false;
    
    function connect() {
      if (dead || !subscribersRef.current.has(symbol)) return;
      
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current.set(symbol, ws);
        
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);
            const stream = msg.stream as string;
            const data = msg.data;
            
            if (!data) return;
            
            // Parse stream type
            if (stream.includes("@aggTrade")) {
              const price = parseFloat(data.p);
              const qty = parseFloat(data.q);
              const isBuyerMaker = data.m;
              
              if (price > 0 && qty > 0) {
                const currentData = dataRef.current.get(symbol) || { ...EMPTY_DATA, symbol };
                const trades = currentData.trades || [];
                
                // Add trade to window
                const newTrade: TradeEntry = {
                  time: data.T,
                  price,
                  quantity: qty,
                  isBuyerMaker,
                  isTakerBuy: !isBuyerMaker, // buyer initiated
                };
                
                // Filter old trades and add new one
                const now = Date.now();
                const filteredTrades = trades.filter(t => t.time > now - WINDOW_MS);
                const updatedTrades = [...filteredTrades, newTrade].slice(-MAX_TRADES);
                
                updateData(symbol, { price, trades: updatedTrades });
              }
            }
            else if (stream.includes("@ticker")) {
              const updates: Partial<RealTimeData> = {
                priceChange: parseFloat(data.c) - parseFloat(data.o),
                priceChangePercent: parseFloat(data.P),
                quoteVolume: parseFloat(data.q),
                high24h: parseFloat(data.h),
                low24h: parseFloat(data.l),
                openPrice: parseFloat(data.o),
              };
              if (data.c) updates.price = parseFloat(data.c);
              updateData(symbol, updates);
            }
            else if (stream.includes("@markPrice")) {
              updateData(symbol, {
                markPrice: parseFloat(data.p),
                indexPrice: parseFloat(data.i),
                fundingRate: parseFloat(data.r),
                nextFundingTime: parseInt(data.T),
              });
            }
            else if (stream.includes("@kline")) {
              const k = data.k;
              const interval = k.i;
              const candle: CandleData = {
                openTime: k.t,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v),
                takerBuyVolume: parseFloat(k.V),
                isClosed: k.x,
              };
              
              const currentData = dataRef.current.get(symbol) || { ...EMPTY_DATA, symbol };
              const existingCandles = currentData.candles[interval] || [];
              
              // Update or append candle
              const idx = existingCandles.findIndex(c => c.openTime === candle.openTime);
              let updatedCandles: CandleData[];
              
              if (idx >= 0) {
                updatedCandles = [...existingCandles];
                updatedCandles[idx] = candle;
              } else {
                updatedCandles = [...existingCandles, candle].slice(-(HIST_LIMITS[interval] || 150));
              }
              
              updateData(symbol, {
                candles: { ...currentData.candles, [interval]: updatedCandles },
              });
            }
          } catch {}
        };
        
        ws.onerror = () => { ws?.close(); };
        
        ws.onclose = () => {
          wsRef.current.delete(symbol);
          if (dead || !subscribersRef.current.has(symbol)) return;
          
          const delay = 3000;
          const existingTimer = reconnectTimers.current.get(symbol);
          if (existingTimer) clearTimeout(existingTimer);
          
          reconnectTimers.current.set(symbol, setTimeout(connect, delay));
        };
        
        ws.onopen = () => {
          // Fetch initial data
          fetchInitialData(symbol);
        };
      } catch {
        const delay = 5000;
        const existingTimer = reconnectTimers.current.get(symbol);
        if (existingTimer) clearTimeout(existingTimer);
        
        reconnectTimers.current.set(symbol, setTimeout(connect, delay));
      }
    }
    
    // 2. Separate order book WebSocket (higher frequency)
    function connectOrderBook() {
      if (dead || !subscribersRef.current.has(symbol)) return;
      
      const obUrl = `wss://fstream.binance.com/ws/${sym}@depth${ORDER_BOOK_DEPTH}@100ms`;
      
      try {
        const obWs = new WebSocket(obUrl);
        
        obWs.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string);
            
            const bids: OrderBookLevel[] = data.bids?.map(([p, q]: [string, string]) => ({
              price: parseFloat(p),
              quantity: parseFloat(q),
              total: 0,
            })) || [];
            
            const asks: OrderBookLevel[] = data.asks?.map(([p, q]: [string, string]) => ({
              price: parseFloat(p),
              quantity: parseFloat(q),
              total: 0,
            })) || [];
            
            // Compute running totals
            let bidTotal = 0;
            bids.forEach(b => { bidTotal += b.quantity * b.price; b.total = bidTotal; });
            
            let askTotal = 0;
            asks.forEach(a => { askTotal += a.quantity * a.price; a.total = askTotal; });
            
            updateData(symbol, {
              orderBook: {
                bids,
                asks,
                lastUpdateId: data.lastUpdateId,
                timestamp: Date.now(),
              },
            });
          } catch {}
        };
        
        obWs.onerror = () => { obWs.close(); };
        
        obWs.onclose = () => {
          if (dead || !subscribersRef.current.has(symbol)) return;
          setTimeout(connectOrderBook, 5000);
        };
      } catch {
        setTimeout(connectOrderBook, 5000);
      }
    }
    
    connect();
    connectOrderBook();
    
    // Freshness monitor
    const freshnessInterval = setInterval(() => {
      const lastUpdate = lastUpdateRef.current.get(symbol) || 0;
      const age = Date.now() - lastUpdate;
      const currentData = dataRef.current.get(symbol);
      
      if (currentData && age > 1000) {
        const freshnessStatus = age < 4000 ? "live" : age < 12000 ? "warning" : age < 30000 ? "delayed" : "disconnected";
        
        if (currentData.freshnessStatus !== freshnessStatus) {
          updateData(symbol, { freshnessStatus, isConnected: freshnessStatus !== "disconnected" });
        }
      }
    }, 2000);
    
    // Store cleanup function
    subscribersRef.current.set(symbol, new Set([...intervals, "_cleanup"]));
    (subscribersRef.current.get(symbol) as Set<string>).delete("_cleanup");
    
    // Store intervals for later
    const symbolData = subscribersRef.current.get(symbol);
    if (symbolData) {
      intervals.forEach(i => symbolData.add(i));
    }
  }, [updateData]);

  const unsubscribe = useCallback((symbol: string) => {
    // Clean up WebSocket
    const ws = wsRef.current.get(symbol);
    if (ws) {
      ws.onclose = null;
      ws.close();
      wsRef.current.delete(symbol);
    }
    
    // Clear timers
    const reconnectTimer = reconnectTimers.current.get(symbol);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimers.current.delete(symbol);
    }
    
    const debounceTimer = debounceTimers.current.get(symbol);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimers.current.delete(symbol);
    }
    
    // Remove from subscribers
    subscribersRef.current.delete(symbol);
    
    // Clear data
    dataRef.current.delete(symbol);
    lastUpdateRef.current.delete(symbol);
    
    setDataMap(new Map(dataRef.current));
  }, []);

  const getData = useCallback((symbol: string): RealTimeData => {
    return dataMap.get(symbol) || { ...EMPTY_DATA, symbol };
  }, [dataMap]);

  const value: RealtimeContextValue = {
    getData,
    subscribe,
    unsubscribe,
  };

  return (
    <RealtimeDataContext.Provider value={value}>
      {children}
    </RealtimeDataContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────── */

async function fetchInitialData(symbol: string): Promise<{
  candles: Record<string, CandleData[]>;
  ticker: Partial<TickerData>;
  funding: FundingData;
}> {
  const fetches = await Promise.all([
    // Fetch klines for all intervals
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=150`),
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=150`),
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=150`),
    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=100`),
    // Fetch ticker
    fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`),
    // Fetch funding
    fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
    // Fetch OI
    fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
  ]);

  const [k1m, k5m, k15m, k1h, tickerRes, fundingRes, oiRes] = fetches;

  const parseKlines = async (res: Response): Promise<CandleData[]> => {
    if (!res.ok) return [];
    const raw: unknown[][] = await res.json();
    return raw.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
      takerBuyVolume: parseFloat(k[9] as string),
      isClosed: true,
    }));
  };

  const [c1m, c5m, c15m, c1h] = await Promise.all([
    parseKlines(k1m),
    parseKlines(k5m),
    parseKlines(k15m),
    parseKlines(k1h),
  ]);

  const ticker = tickerRes.ok ? await tickerRes.json() : {};
  const funding = fundingRes.ok ? await fundingRes.json() : {};
  const oi = oiRes.ok ? await oiRes.json() : {};

  return {
    candles: {
      "1m": c1m,
      "5m": c5m,
      "15m": c15m,
      "1h": c1h,
    },
    ticker: {
      price: parseFloat(ticker.lastPrice || ticker.closePrice || "0"),
      priceChange: parseFloat(ticker.priceChange || "0"),
      priceChangePercent: parseFloat(ticker.priceChangePercent || "0"),
      quoteVolume: parseFloat(ticker.quoteVolume || "0"),
      high24h: parseFloat(ticker.highPrice || "0"),
      low24h: parseFloat(ticker.lowPrice || "0"),
      openPrice: parseFloat(ticker.openPrice || "0"),
    },
    funding: {
      fundingRate: parseFloat(funding.lastFundingRate || "0"),
      markPrice: parseFloat(funding.markPrice || "0"),
      indexPrice: parseFloat(funding.indexPrice || "0"),
      nextFundingTime: parseInt(funding.nextFundingTime || "0"),
    },
  };
}

export function useRealtimeData(symbol: string, intervals: string[] = ["1m", "5m", "15m", "1h"]): RealTimeData {
  const { getData, subscribe, unsubscribe } = useContext(RealtimeDataContext);
  const subscribedRef = useRef(false);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    if (!subscribedRef.current) {
      subscribe(symbol, intervals);
      subscribedRef.current = true;
    }

    return () => {
      if (subscribedRef.current) {
        unsubscribe(symbol);
        subscribedRef.current = false;
      }
    };
  }, [symbol, intervals, subscribe, unsubscribe]);

  return getData(symbol);
}

/* ── Convenience hooks ─────────────────────────────────────────────── */

export function useRealtimeTrades(symbol: string): TradeEntry[] {
  const data = useRealtimeData(symbol);
  return data.trades;
}

export function useRealtimeCandles(symbol: string, interval: string): CandleData[] {
  const data = useRealtimeData(symbol);
  return data.candles[interval] || [];
}

export function useRealtimeOrderBook(symbol: string): OrderBookSnapshot | null {
  const data = useRealtimeData(symbol);
  return data.orderBook;
}

export function useRealtimeMetrics(symbol: string): {
  buyPressure: number;
  sellPressure: number;
  delta: number;
  deltaUSD: number;
  volumeImbalance: number;
  bidDepthUSD: number;
  askDepthUSD: number;
} {
  const data = useRealtimeData(symbol);
  return {
    buyPressure: data.buyPressure,
    sellPressure: data.sellPressure,
    delta: data.delta,
    deltaUSD: data.deltaUSD,
    volumeImbalance: data.volumeImbalance,
    bidDepthUSD: data.bidDepthUSD,
    askDepthUSD: data.askDepthUSD,
  };
}