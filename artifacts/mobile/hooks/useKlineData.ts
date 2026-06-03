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

async function fetchKlines(symbol: string, interval: Interval, limit = HIST_LIMIT): Promise<Candle[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
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
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(interval);
  const symbolRef = useRef(symbol);

  const applyCandle = useCallback((incoming: Candle) => {
    setCandles((prev) => {
      const idx = prev.findIndex((c) => c.openTime === incoming.openTime);
      if (idx === -1) {
        return [...prev.slice(-(HIST_LIMIT - 1)), incoming];
      }
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
    setLastKlineUpdate(Date.now());
  }, []);

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return;
    const sym = symbolRef.current.toLowerCase();
    const url = `wss://fstream.binance.com/ws/${sym}@kline_${intervalRef.current}`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          if (msg["e"] !== "kline") return;
          const k = msg["k"] as Record<string, unknown>;
          applyCandle({
            openTime: k["t"] as number,
            open: parseFloat(k["o"] as string),
            high: parseFloat(k["h"] as string),
            low: parseFloat(k["l"] as string),
            close: parseFloat(k["c"] as string),
            volume: parseFloat(k["v"] as string),
            takerBuyVolume: parseFloat(k["V"] as string),
            isClosed: k["x"] as boolean,
          });
        } catch {}
      };

      ws.onerror = () => { ws.close(); };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        reconnectRef.current = setTimeout(connectWs, 3_000);
      };
    } catch {
      reconnectRef.current = setTimeout(connectWs, 5_000);
    }
  }, [applyCandle]);

  useEffect(() => {
    mountedRef.current = true;
    intervalRef.current = interval;
    symbolRef.current = symbol;

    setLoading(true);
    setCandles([]);
    setLastKlineUpdate(0);

    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }

    fetchKlines(symbol, interval).then((data) => {
      if (!mountedRef.current) return;
      if (data.length > 0) {
        setCandles(data);
        setLastKlineUpdate(Date.now());
        setLoading(false);
      } else {
        setLoading(false);
      }
      connectWs();
    });

    const pollTimer = setInterval(async () => {
      if (!mountedRef.current) return;
      const fresh = await fetchKlines(symbol, interval, 5);
      if (!mountedRef.current || fresh.length === 0) return;
      setCandles((prev) => {
        if (prev.length === 0) return fresh;
        const map = new Map(prev.map((c) => [c.openTime, c]));
        fresh.forEach((c) => map.set(c.openTime, c));
        return Array.from(map.values())
          .sort((a, b) => a.openTime - b.openTime)
          .slice(-HIST_LIMIT);
      });
      setLastKlineUpdate(Date.now());
    }, 20_000);

    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [interval, symbol, connectWs]);

  return { candles, loading, lastKlineUpdate };
}
