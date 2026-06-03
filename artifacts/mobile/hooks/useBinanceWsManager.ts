/**
 * Unified Binance WebSocket Manager
 * Provides a single connection pool for all real-time data streams
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TradeUpdate {
  symbol: string;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
  timestamp: number;
}

export interface KlineUpdate {
  symbol: string;
  interval: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  isClosed: boolean;
}

export interface OrderBookUpdate {
  symbol: string;
  bids: [string, string][]; // [price, quantity][]
  asks: [string, string][];
  lastUpdateId: number;
}

export interface FundingRateUpdate {
  symbol: string;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface Ticker24hUpdate {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  lastPrice: number;
}

/* ── WebSocket Manager ─────────────────────────────────────────────── */

type MessageHandler<T> = (data: T) => void;

interface WsSubscription {
  url: string;
  handlers: Map<string, MessageHandler<unknown>>;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  dead: boolean;
}

class BinanceWsManager {
  private static instance: BinanceWsManager | null = null;
  private subscriptions = new Map<string, WsSubscription>();
  private readonly BASE_URL = "wss://fstream.binance.com/ws";
  private readonly RECONNECT_DELAY = 3000;
  private readonly MAX_RECONNECT_DELAY = 30000;

  static getInstance(): BinanceWsManager {
    if (!BinanceWsManager.instance) {
      BinanceWsManager.instance = new BinanceWsManager();
    }
    return BinanceWsManager.instance;
  }

  subscribe<T>(id: string, url: string, handler: MessageHandler<T>): () => void {
    let sub = this.subscriptions.get(id);
    
    if (!sub) {
      sub = {
        url,
        handlers: new Map(),
        ws: null,
        reconnectTimer: null,
        dead: false,
      };
      this.subscriptions.set(id, sub);
      this.connect(id);
    }

    sub.handlers.set(id, handler as MessageHandler<unknown>);

    return () => {
      const s = this.subscriptions.get(id);
      if (s) {
        s.handlers.delete(id);
        if (s.handlers.size === 0) {
          this.disconnect(id);
        }
      }
    };
  }

  private connect(id: string): void {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.dead) return;

    try {
      const ws = new WebSocket(sub.url);
      sub.ws = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          sub.handlers.forEach((handler) => {
            try {
              handler(data);
            } catch {}
          });
        } catch {}
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        if (sub.dead) return;
        const delay = Math.min(this.RECONNECT_DELAY * (this.subscriptions.size), this.MAX_RECONNECT_DELAY);
        sub.reconnectTimer = setTimeout(() => this.connect(id), delay);
      };
    } catch {
      const delay = Math.min(this.RECONNECT_DELAY * (this.subscriptions.size), this.MAX_RECONNECT_DELAY);
      sub.reconnectTimer = setTimeout(() => this.connect(id), delay);
    }
  }

  disconnect(id: string): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.dead = true;
    if (sub.reconnectTimer) clearTimeout(sub.reconnectTimer);
    if (sub.ws) {
      sub.ws.onclose = null;
      sub.ws.close();
    }
    this.subscriptions.delete(id);
  }
}

/* ── React Hook ────────────────────────────────────────────────────── */

export interface WsManagerState {
  isConnected: boolean;
  lastUpdate: number;
  subscriptions: number;
}

export function useBinanceWsManager() {
  const [state, setState] = useState<WsManagerState>({
    isConnected: false,
    lastUpdate: 0,
    subscriptions: 0,
  });

  const managerRef = useRef(BinanceWsManager.getInstance());

  useEffect(() => {
    const checkInterval = setInterval(() => {
      const subs = managerRef.current.subscriptions;
      setState({
        isConnected: subs.size > 0,
        lastUpdate: Date.now(),
        subscriptions: subs.size,
      });
    }, 5000);

    return () => clearInterval(checkInterval);
  }, []);

  return {
    manager: managerRef.current,
    state,
  };
}

/* ── Composable hooks factory ──────────────────────────────────────── */

export function createBinanceStream<T>(
  streamId: string,
  buildUrl: () => string,
  parseMessage: (data: Record<string, unknown>) => T | null,
) {
  return function useBinanceStream(
    onData: (data: T) => void,
    enabled: boolean = true,
  ): { isConnected: boolean } {
    const [isConnected, setIsConnected] = useState(false);
    const handlerRef = useRef(onData);
    handlerRef.current = onData;

    useEffect(() => {
      if (!enabled) return;

      const url = buildUrl();
      const manager = BinanceWsManager.getInstance();

      let lastMessage = 0;
      
      const wrappedHandler: MessageHandler<unknown> = (data) => {
        const parsed = parseMessage(data as Record<string, unknown>);
        if (parsed) {
          lastMessage = Date.now();
          setIsConnected(true);
          handlerRef.current(parsed);
        }
      };

      const unsubscribe = manager.subscribe(streamId, url, wrappedHandler);

      const checkConnection = setInterval(() => {
        setIsConnected(Date.now() - lastMessage < 10000);
      }, 5000);

      return () => {
        clearInterval(checkConnection);
        unsubscribe();
      };
    }, [streamId, enabled]);

    return { isConnected };
  };
}