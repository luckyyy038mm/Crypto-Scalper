/**
 * Real-Time Kline Data Hook
 * Uses Binance WebSocket for live candle updates with REST fallback
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  isClosed: boolean;
}

const HIST_LIMIT = 150;
const WS_RECONNECT_DELAY = 3000;
const REST_POLL_INTERVAL = 15000;

interface KlineMessage {
  e: "kline";
  k: {
    t: number;  // Kline start time
    o: string;   // Open price
    h: string;   // High price
    l: string;   // Low price
    c: string;   // Close price
    v: string;   // Volume
    V: string;   // Taker buy volume
    x: boolean;  // Is closed
    i: string;   // Interval
  };
}

function parseKline(k: unknown[]): Candle {
  return {
    openTime: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    takerBuyVolume: parseFloat(k[9] as string),
    isClosed: true,
  };
}

async function fetchKlines(symbol: string, interval: Interval, limit = HIST_LIMIT): Promise<Candle[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw: unknown[][] = await res.json();
    return raw.map(parseKline);
  } catch {
    return [];
  }
}

export function useKlineData(interval: Interval, symbol: string = "BTCUSDT") {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastKlineUpdate, setLastKlineUpdate] = useState(0);

  const mountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalRef = useRef(interval);
  const symbolRef = useRef(symbol);
  const lastRestSyncRef = useRef(0);

  // Keep refs in sync
  intervalRef.current = interval;
  symbolRef.current = symbol;

  const applyCandle = useCallback((incoming: Candle) => {
    if (!mountedRef.current) return;
    
    setCandles(prev => {
      const idx = prev.findIndex(c => c.openTime === incoming.openTime);
      
      if (idx === -1) {
        // New candle - add to end
        return [...prev.slice(-(HIST_LIMIT - 1)), incoming];
      } else {
        // Update existing candle
        const next = [...prev];
        next[idx] = incoming;
        return next;
      }
    });
    setLastKlineUpdate(Date.now());
  }, []);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    
    const sym = symbolRef.current.toLowerCase();
    const url = `wss://fstream.binance.com/ws/${sym}@kline_${intervalRef.current}`;
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as KlineMessage;
          if (msg.e !== "kline") return;
          
          const k = msg.k;
          if (k.i !== intervalRef.current) return;
          
          applyCandle({
            openTime: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            takerBuyVolume: parseFloat(k.V),
            isClosed: k.x,
          });
        } catch {}
      };

      ws.onerror = () => { ws.close(); };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        reconnectTimerRef.current = setTimeout(connectWs, WS_RECONNECT_DELAY);
      };

      ws.onopen = () => {
        // WebSocket connected - reduce REST polling frequency
        if (restPollTimerRef.current) {
          clearInterval(restPollTimerRef.current);
        }
      };
    } catch {
      reconnectTimerRef.current = setTimeout(connectWs, WS_RECONNECT_DELAY);
    }
  }, [applyCandle]);

  useEffect(() => {
    mountedRef.current = true;
    intervalRef.current = interval;
    symbolRef.current = symbol;

    setLoading(true);
    setCandles([]);
    setLastKlineUpdate(0);

    // Clean up existing timers and connections
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (restPollTimerRef.current) {
      clearInterval(restPollTimerRef.current);
      restPollTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Fetch initial historical data
    fetchKlines(symbol, interval).then(data => {
      if (!mountedRef.current) return;
      
      if (data.length > 0) {
        setCandles(data);
        setLastKlineUpdate(Date.now());
      }
      setLoading(false);
      
      // Start WebSocket for real-time updates
      connectWs();
    });

    // REST fallback polling - less frequent since WS is primary
    restPollTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      
      const now = Date.now();
      // Don't poll if we got a WS update recently (within 5 seconds)
      if (now - lastRestSyncRef.current < 5000 && wsRef.current?.readyState === WebSocket.OPEN) return;
      
      const fresh = await fetchKlines(symbol, interval, 5);
      if (!mountedRef.current || fresh.length === 0) return;
      
      lastRestSyncRef.current = now;
      
      setCandles(prev => {
        if (prev.length === 0) return fresh;
        
        const map = new Map(prev.map(c => [c.openTime, c]));
        fresh.forEach(c => map.set(c.openTime, c));
        
        return Array.from(map.values())
          .sort((a, b) => a.openTime - b.openTime)
          .slice(-HIST_LIMIT);
      });
      setLastKlineUpdate(now);
    }, REST_POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (restPollTimerRef.current) {
        clearInterval(restPollTimerRef.current);
        restPollTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [interval, symbol, connectWs]);

  return { candles, loading, lastKlineUpdate };
}
