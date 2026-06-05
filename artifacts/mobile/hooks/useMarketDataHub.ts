/**
 * useMarketDataHub - React hook for accessing Market Data Hub
 * 
 * IMPORTANT: All components must use this hook instead of calling Binance directly.
 * This ensures data consistency across the entire application.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  marketDataHub,
  MarketDataHub,
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
} from '@lib/services/data-hub';

/**
 * Get complete market data for a symbol
 */
export function useMarketData(symbol: Symbol): MarketData {
  const [data, setData] = useState<MarketData>(() => marketDataHub.getMarketData(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setData(marketDataHub.getMarketData(symbol));
    }, 100);
    return () => clearInterval(interval);
  }, [symbol]);

  return data;
}

/**
 * Get price data for a symbol
 */
export function usePrice(symbol: Symbol): PriceData | null {
  const [price, setPrice] = useState<PriceData | null>(() => marketDataHub.getPrice(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setPrice(marketDataHub.getPrice(symbol));
    }, 500);
    return () => clearInterval(interval);
  }, [symbol]);

  return price;
}

/**
 * Get funding data for a symbol
 */
export function useFunding(symbol: Symbol): FundingData | null {
  const [funding, setFunding] = useState<FundingData | null>(() => marketDataHub.getFunding(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setFunding(marketDataHub.getFunding(symbol));
    }, 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  return funding;
}

/**
 * Get order book data for a symbol
 */
export function useOrderBook(symbol: Symbol): OrderBookData | null {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(() => marketDataHub.getOrderBook(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setOrderBook(marketDataHub.getOrderBook(symbol));
    }, 200);
    return () => clearInterval(interval);
  }, [symbol]);

  return orderBook;
}

/**
 * Get candle data for a symbol and interval
 */
export function useCandles(symbol: Symbol, interval: string): CandleData[] {
  const [candles, setCandles] = useState<CandleData[]>(() => marketDataHub.getCandles(symbol, interval));

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCandles(marketDataHub.getCandles(symbol, interval));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [symbol, interval]);

  return candles;
}

/**
 * Get recent trades for a symbol
 */
export function useTrades(symbol: Symbol): TradeEntry[] {
  const [trades, setTrades] = useState<TradeEntry[]>(() => marketDataHub.getTrades(symbol));

  useEffect(() => {
    const interval = setInterval(() => {
      setTrades(marketDataHub.getTrades(symbol));
    }, 200);
    return () => clearInterval(interval);
  }, [symbol]);

  return trades;
}

/**
 * Get market metrics
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
 * Start/Stop the Market Data Hub
 */
export function useDataHubControl() {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const status = marketDataHub.getSystemStatus();
    setIsRunning(status.isRunning);
  }, []);

  const start = useCallback(() => {
    marketDataHub.start();
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    marketDataHub.stop();
    setIsRunning(false);
  }, []);

  return { isRunning, start, stop };
}

/**
 * Hook to sync data from an external source into the Market Data Hub
 */
export function useSyncMarketData(symbol: Symbol, data: Partial<MarketData>): void {
  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      marketDataHub.updateMarketData(symbol, data);
    }
  }, [symbol, JSON.stringify(data)]);
}
