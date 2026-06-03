import { useEffect, useRef, useState } from "react";

import type { CoinSymbol } from "@/constants/coins";

export type FootprintTimeframe = "1m" | "5m" | "15m";

export const TF_MS: Record<FootprintTimeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
};

const COIN_TICK: Record<string, number> = {
  BTCUSDT: 10,
  ETHUSDT: 1,
  SOLUSDT: 0.1,
  XRPUSDT: 0.001,
};

function getTickSize(sym: string): number {
  return COIN_TICK[sym] ?? 10;
}

function roundToTick(price: number, tick: number): number {
  return Math.round(price / tick) * tick;
}

export interface FootprintLevel {
  price: number;
  bidVol: number;
  askVol: number;
  delta: number;
  totalVol: number;
}

export interface FootprintBar {
  openTime: number;
  closeTime: number;
  levels: FootprintLevel[];
  high: number;
  low: number;
  close: number;
  totalDelta: number;
  totalVol: number;
  maxLevelVol: number;
}

export interface FootprintState {
  completedBars: FootprintBar[];
  currentBar: FootprintBar | null;
  isConnected: boolean;
  tradesCount: number;
  currentPrice: number;
}

const MAX_COMPLETED = 6;

type Accumulator = {
  openTime: number;
  levels: Map<number, { bidVol: number; askVol: number }>;
  high: number;
  low: number;
  close: number;
  totalDelta: number;
  totalVol: number;
};

function buildBar(acc: Accumulator, closeTime: number): FootprintBar {
  let maxLevelVol = 0;
  const levels: FootprintLevel[] = [];

  acc.levels.forEach((v, price) => {
    const delta = v.askVol - v.bidVol;
    const totalVol = v.bidVol + v.askVol;
    levels.push({ price, bidVol: v.bidVol, askVol: v.askVol, delta, totalVol });
    if (v.bidVol > maxLevelVol) maxLevelVol = v.bidVol;
    if (v.askVol > maxLevelVol) maxLevelVol = v.askVol;
  });

  levels.sort((a, b) => b.price - a.price);

  return {
    openTime: acc.openTime,
    closeTime,
    levels,
    high: acc.high,
    low: acc.low,
    close: acc.close,
    totalDelta: acc.totalDelta,
    totalVol: acc.totalVol,
    maxLevelVol,
  };
}

function makeAcc(openTime: number, price: number): Accumulator {
  return {
    openTime,
    levels: new Map(),
    high: price,
    low: price,
    close: price,
    totalDelta: 0,
    totalVol: 0,
  };
}

export function useFootprintData(
  symbol: CoinSymbol,
  tf: FootprintTimeframe,
): FootprintState {
  const [state, setState] = useState<FootprintState>({
    completedBars: [],
    currentBar: null,
    isConnected: false,
    tradesCount: 0,
    currentPrice: 0,
  });

  const accRef = useRef<Accumulator | null>(null);
  const completedRef = useRef<FootprintBar[]>([]);
  const tradesRef = useRef(0);

  useEffect(() => {
    accRef.current = null;
    completedRef.current = [];
    tradesRef.current = 0;
    setState({
      completedBars: [],
      currentBar: null,
      isConnected: false,
      tradesCount: 0,
      currentPrice: 0,
    });
  }, [symbol, tf]);

  useEffect(() => {
    const sym = symbol.toLowerCase();
    const url = `wss://stream.binance.com:9443/ws/${sym}@trade`;
    const barMs = TF_MS[tf];
    const tick = getTickSize(symbol);

    let ws: WebSocket | null = null;
    let dead = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function processTrade(price: number, qty: number, isBuyerMaker: boolean) {
      const now = Date.now();
      const barOpenTime = Math.floor(now / barMs) * barMs;
      const roundedPrice = roundToTick(price, tick);

      if (!accRef.current) {
        accRef.current = makeAcc(barOpenTime, price);
      } else if (accRef.current.openTime !== barOpenTime) {
        const bar = buildBar(accRef.current, barOpenTime);
        if (bar.totalVol > 0) {
          completedRef.current = [
            ...completedRef.current.slice(-(MAX_COMPLETED - 1)),
            bar,
          ];
        }
        accRef.current = makeAcc(barOpenTime, price);
      }

      const acc = accRef.current;
      const lv = acc.levels.get(roundedPrice) ?? { bidVol: 0, askVol: 0 };

      if (isBuyerMaker) {
        lv.bidVol += qty;
        acc.totalDelta -= qty;
      } else {
        lv.askVol += qty;
        acc.totalDelta += qty;
      }

      acc.levels.set(roundedPrice, lv);
      acc.totalVol += qty;
      acc.close = price;
      if (price > acc.high) acc.high = price;
      if (price < acc.low) acc.low = price;

      tradesRef.current++;
    }

    function connect() {
      if (dead) return;
      try {
        ws = new WebSocket(url);

        ws.onopen = () => setState((p) => ({ ...p, isConnected: true }));

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as {
              p: string;
              q: string;
              m: boolean;
            };
            const price = parseFloat(msg.p);
            const qty = parseFloat(msg.q);
            if (price > 0 && qty > 0) processTrade(price, qty, msg.m);
          } catch {}
        };

        ws.onerror = () => ws?.close();

        ws.onclose = () => {
          if (dead) return;
          setState((p) => ({ ...p, isConnected: false }));
          retryTimer = setTimeout(connect, 3_000);
        };
      } catch {
        retryTimer = setTimeout(connect, 5_000);
      }
    }

    connect();

    const renderTimer = setInterval(() => {
      if (dead) return;
      const currentBar =
        accRef.current && accRef.current.totalVol > 0
          ? buildBar(accRef.current, accRef.current.openTime + barMs)
          : null;

      setState({
        completedBars: completedRef.current,
        currentBar,
        isConnected: ws?.readyState === WebSocket.OPEN,
        tradesCount: tradesRef.current,
        currentPrice: accRef.current?.close ?? 0,
      });
    }, 500);

    return () => {
      dead = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(renderTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol, tf]);

  return state;
}
