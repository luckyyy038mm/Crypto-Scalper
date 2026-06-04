/**
 * useMarketData - React hook for accessing Market Data Hub
 * 
 * IMPORTANT: All components must use this hook instead of calling Binance directly.
 * This ensures data consistency across the entire application.
 */

import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import {
  MarketDataHub,
  marketDataHub,
  Symbol,
  SUPPORTED_SYMBOLS,
  MarketData,
  PriceData,
  CandleData,
  OrderBookData,
  FundingData,
  TradeEntry,
  MarketMetrics,
  ConnectionStatus,
  DataFreshness,
  DataConfidence,
  SystemStatus,
  MarketDataUpdate,
  DataType,
  DEFAULT_MARKET_DATA,
} from '../services/data-hub';

// ============================================================================
// Context
// ============================================================================

interface MarketDataContextValue {
  hub: MarketDataHub;
  subscribe: (subscriber: { id: string; name: string; dataTypes: DataType[]; callback: (update: MarketDataUpdate) => void }) => () => void;
}

const MarketDataContext = createContext<MarketDataContextValue>({
  hub: marketDataHub,
  subscribe: () => () => {},
});

// ============================================================================
// Provider
// ============================================================================

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      marketDataHub.start();
      setInitialized(true);
    }

    return () => {
      // Don't stop on unmount - keep running for other consumers
    };
  }, [initialized]);

  const subscribe = useCallback((subscriber: { id: string; name: string; dataTypes: DataType[]; callback: (update: MarketDataUpdate) => void }) => {
    return marketDataHub.subscribe(subscriber);
  }, []);

  return (
    <MarketDataContext.Provider value={{ hub: marketDataHub, subscribe }}>
      {children}
    </MarketDataContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get complete market data for a symbol
 */
export function useMarketData(symbol: Symbol, intervals: string[] = ['1m', '5m', '15m', '1h']): MarketData {
  const [data, setData] = useState<MarketData>(() => marketDataHub.getMarketData(symbol));

  useEffect(() => {
    // Initial data
    setData(marketDataHub.getMarketData(symbol));

    // Subscribe to updates
    const unsubscribe = marketDataHub.subscribe({
      id: `useMarketData-${symbol}`,
      name: `MarketData-${symbol}`,
      dataTypes: ['price', 'candle', 'orderbook', 'funding', 'trade', 'markPrice'],
      callback: () => {
        setData(marketDataHub.getMarketData(symbol));
      },
    });

    // Poll for updates (alternative to subscription)
    const interval = setInterval(() => {
      setData(marketDataHub.getMarketData(symbol));
    }, 100);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [symbol]);

  return data;
}

/**
 * Get price data for a symbol
 */
export function usePrice(symbol: Symbol): PriceData | null {
  const [price, setPrice] = useState<PriceData | null>(() => marketDataHub.getPrice(symbol));

  useEffect(() => {
    const unsubscribe = marketDataHub.subscribe({
      id: `usePrice-${symbol}`,
      name: `Price-${symbol}`,
      dataTypes: ['price', 'trade'],
      callback: () => {
        setPrice(marketDataHub.getPrice(symbol));
      },
    });

    const interval = setInterval(() => {
      setPrice(marketDataHub.getPrice(symbol));
    }, 500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [symbol]);

  return price;
}

/**
 * Get funding data for a symbol
 */
export function useFunding(symbol: Symbol): FundingData | null {
  const [funding, setFunding] = useState<FundingData | null>(() => marketDataHub.getFunding(symbol));

  useEffect(() => {
    const unsubscribe = marketDataHub.subscribe({
      id: `useFunding-${symbol}`,
      name: `Funding-${symbol}`,
      dataTypes: ['funding', 'markPrice'],
      callback: () => {
        setFunding(marketDataHub.getFunding(symbol));
      },
    });

    const interval = setInterval(() => {
      setFunding(marketDataHub.getFunding(symbol));
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [symbol]);

  return funding;
}

/**
 * Get order book data for a symbol
 */
export function useOrderBook(symbol: Symbol): OrderBookData | null {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(() => marketDataHub.getOrderBook(symbol));

  useEffect(() => {
    const unsubscribe = marketDataHub.subscribe({
      id: `useOrderBook-${symbol}`,
      name: `OrderBook-${symbol}`,
      dataTypes: ['orderbook'],
      callback: () => {
        setOrderBook(marketDataHub.getOrderBook(symbol));
      },
    });

    const interval = setInterval(() => {
      setOrderBook(marketDataHub.getOrderBook(symbol));
    }, 200);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [symbol]);

  return orderBook;
}

/**
 * Get candle data for a symbol and interval
 */
export function useCandles(symbol: Symbol, interval: string): CandleData[] {
  const [candles, setCandles] = useState<CandleData[]>(() => marketDataHub.getCandles(symbol, interval));

  useEffect(() => {
    const unsubscribe = marketDataHub.subscribe({
      id: `useCandles-${symbol}-${interval}`,
      name: `Candles-${symbol}-${interval}`,
      dataTypes: ['candle'],
      callback: (update) => {
        if (update.type === 'candle' && (update.data as CandleData).interval === interval) {
          setCandles(marketDataHub.getCandles(symbol, interval));
        }
      },
    });

    const intervalId = setInterval(() => {
      setCandles(marketDataHub.getCandles(symbol, interval));
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [symbol, interval]);

  return candles;
}

/**
 * Get recent trades for a symbol
 */
export function useTrades(symbol: Symbol): TradeEntry[] {
  const [trades, setTrades] = useState<TradeEntry[]>(() => marketDataHub.getTrades(symbol));

  useEffect(() => {
    const unsubscribe = marketDataHub.subscribe({
      id: `useTrades-${symbol}`,
      name: `Trades-${symbol}`,
      dataTypes: ['trade'],
      callback: () => {
        setTrades(marketDataHub.getTrades(symbol));
      },
    });

    const interval = setInterval(() => {
      setTrades(marketDataHub.getTrades(symbol));
    }, 200);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [symbol]);

  return trades;
}

/**
 * Get market metrics (buy/sell pressure, delta, etc.)
 */
export function useMarketMetrics(symbol: Symbol): MarketMetrics {
  const [metrics, setMetrics] = useState<MarketMetrics>(() => marketDataHub.getMetrics(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(marketDataHub.getMetrics(symbol));
    }, 500);

    return () => clearInterval(interval);
  }, [symbol]);

  return metrics;
}

/**
 * Get connection status for a symbol
 */
export function useConnectionStatus(symbol: Symbol): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(() => marketDataHub.getConnectionStatus(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(marketDataHub.getConnectionStatus(symbol));
    }, 1000);

    return () => clearInterval(interval);
  }, [symbol]);

  return status;
}

/**
 * Get data freshness for a symbol
 */
export function useDataFreshness(symbol: Symbol): DataFreshness {
  const [freshness, setFreshness] = useState<DataFreshness>(() => marketDataHub.getDataFreshness(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setFreshness(marketDataHub.getDataFreshness(symbol));
    }, 1000);

    return () => clearInterval(interval);
  }, [symbol]);

  return freshness;
}

/**
 * Get data confidence score for a symbol
 */
export function useConfidenceScore(symbol: Symbol): DataConfidence {
  const [confidence, setConfidence] = useState<DataConfidence>(() => marketDataHub.getConfidenceScore(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setConfidence(marketDataHub.getConfidenceScore(symbol));
    }, 1000);

    return () => clearInterval(interval);
  }, [symbol]);

  return confidence;
}

/**
 * Get system-wide status
 */
export function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>(() => marketDataHub.getSystemStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(marketDataHub.getSystemStatus());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return status;
}

/**
 * Get all prices (for dashboard)
 */
export function useAllPrices(): Map<Symbol, PriceData> {
  const [prices, setPrices] = useState<Map<Symbol, PriceData>>(new Map());

  useEffect(() => {
    const interval = setInterval(() => {
      const newPrices = new Map<Symbol, PriceData>();
      for (const symbol of SUPPORTED_SYMBOLS) {
        const price = marketDataHub.getPrice(symbol);
        if (price) newPrices.set(symbol, price);
      }
      setPrices(newPrices);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return prices;
}

/**
 * Reconnect a symbol or all symbols
 */
export function useReconnect() {
  const [reconnecting, setReconnecting] = useState(false);

  const reconnect = useCallback(async (symbol?: Symbol) => {
    setReconnecting(true);
    try {
      await marketDataHub.reconnect(symbol);
    } finally {
      setReconnecting(false);
    }
  }, []);

  return { reconnect, reconnecting };
}

/**
 * Start/Stop the Market Data Hub
 */
export function useDataHubControl() {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const status = marketDataHub.getSystemStatus();
    setIsRunning(status.isRunning);
  }, []);

  const start = useCallback(async () => {
    try {
      await marketDataHub.start();
      setIsRunning(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await marketDataHub.stop();
      setIsRunning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop');
    }
  }, []);

  return { isRunning, error, start, stop };
}

// ============================================================================
// Legacy Compatibility Hooks
// ============================================================================

/**
 * Compatible with existing useBinanceData hook
 */
export function useBinanceDataCompat(symbol: string = 'BTCUSDT'): {
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
  freshnessStatus: 'live' | 'warning' | 'delayed' | 'disconnected';
} {
  const marketData = useMarketData(symbol as Symbol);

  return {
    price: marketData.price,
    priceChange: marketData.priceChange,
    priceChangePercent: marketData.priceChangePercent,
    quoteVolume: marketData.quoteVolume,
    markPrice: marketData.markPrice,
    indexPrice: marketData.indexPrice,
    fundingRate: marketData.fundingRate,
    nextFundingTime: marketData.nextFundingTime,
    openInterest: marketData.openInterest,
    isConnected: marketData.isConnected,
    lastUpdated: marketData.lastUpdate,
    dataAge: marketData.lastUpdate ? Math.round((Date.now() - marketData.lastUpdate) / 1000) : 999,
    freshnessStatus: marketData.freshnessStatus,
  };
}