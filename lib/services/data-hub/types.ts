/**
 * Market Data Hub - Types
 * 
 * Centralized type definitions for the Market Data Hub system.
 * All market data types flow through this single source.
 */

// ============================================================================
// Core Data Types
// ============================================================================

export type Symbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT' | 'XRPUSDT';

export const SUPPORTED_SYMBOLS: Symbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

export interface PriceData {
  symbol: Symbol;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  timestamp: number;
}

export interface CandleData {
  symbol: Symbol;
  interval: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  closeTime: number;
  isClosed: boolean;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  symbol: Symbol;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: number;
}

export interface FundingData {
  symbol: Symbol;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface OpenInterestData {
  symbol: Symbol;
  openInterest: number;
  timestamp: number;
}

export interface TradeEntry {
  symbol: Symbol;
  time: number;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
  isTakerBuy: boolean;
  tradeId: number;
}

export interface TickerData {
  symbol: Symbol;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  high24h: number;
  low24h: number;
  openPrice: number;
}

// ============================================================================
// Connection & Status Types
// ============================================================================

export interface ConnectionStatus {
  connected: boolean;
  lastConnected: number | null;
  lastDisconnected: number | null;
  reconnectAttempts: number;
  errorCount: number;
}

export interface DataFreshness {
  price: number | null;        // milliseconds since last update
  orderBook: number | null;
  funding: number | null;
  openInterest: number | null;
  volume: number | null;
  trades: number | null;
}

export interface DataConfidence {
  score: number;              // 0-100
  connectionHealth: number;   // 0-100
  dataFreshness: number;      // 0-100
  synchronization: number;      // 0-100
  errorRate: number;           // 0-100 (inverse)
  latency: number;             // milliseconds
}

export type FreshnessStatus = 'live' | 'warning' | 'delayed' | 'disconnected';

// ============================================================================
// Aggregated Metrics
// ============================================================================

export interface MarketMetrics {
  buyPressure: number;
  sellPressure: number;
  delta: number;
  deltaUSD: number;
  volumeImbalance: number;
  bidDepthUSD: number;
  askDepthUSD: number;
}

// ============================================================================
// Complete Market Data
// ============================================================================

export interface MarketData {
  symbol: Symbol;
  price: number;
  openPrice: number;
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
  trades: TradeEntry[];
  candles: Record<string, CandleData[]>;
  orderBook: OrderBookData | null;
  metrics: MarketMetrics;
  isConnected: boolean;
  freshnessStatus: FreshnessStatus;
  lastUpdate: number;
}

// ============================================================================
// Subscription & Configuration Types
// ============================================================================

export type DataType = 
  | 'price' 
  | 'candle' 
  | 'orderbook' 
  | 'funding' 
  | 'openInterest' 
  | 'trade' 
  | 'ticker' 
  | 'markPrice';

export interface Subscriber {
  id: string;
  name: string;
  callback: (update: MarketDataUpdate) => void;
  dataTypes: DataType[];
}

export interface MarketDataUpdate {
  type: DataType;
  symbol: Symbol;
  data: unknown;
  timestamp: number;
  confidence: number;
}

export interface DataHubConfig {
  binanceWsUrl: string;
  binanceRestUrl: string;
  reconnectInterval: number;
  heartbeatInterval: number;
  maxReconnectAttempts: number;
  cacheTimeout: number;
  confidenceThreshold: number;
}

// ============================================================================
// System Status Types
// ============================================================================

export interface SystemStatus {
  isRunning: boolean;
  totalSubscribers: number;
  connectionSummary: {
    connected: number;
    disconnected: number;
    total: number;
  };
  overallConfidence: number;
  errorLog: ErrorEntry[];
}

export interface ErrorEntry {
  timestamp: number;
  message: string;
  symbol?: Symbol;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_MARKET_DATA: MarketData = {
  symbol: 'BTCUSDT',
  price: 0,
  openPrice: 0,
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
  metrics: {
    buyPressure: 50,
    sellPressure: 50,
    delta: 0,
    deltaUSD: 0,
    volumeImbalance: 0,
    bidDepthUSD: 0,
    askDepthUSD: 0,
  },
  isConnected: false,
  freshnessStatus: 'disconnected',
  lastUpdate: 0,
};

export const DEFAULT_CONFIG: DataHubConfig = {
  binanceWsUrl: 'wss://fstream.binance.com/ws',
  binanceRestUrl: 'https://fapi.binance.com',
  reconnectInterval: 3000,
  heartbeatInterval: 30000,
  maxReconnectAttempts: 10,
  cacheTimeout: 5000,
  confidenceThreshold: 50,
};

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_PRICE_DATA: PriceData = {
  symbol: 'BTCUSDT',
  price: 0,
  priceChange: 0,
  priceChangePercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
  quoteVolume24h: 0,
  timestamp: 0,
};

export const DEFAULT_FUNDING_DATA: FundingData = {
  symbol: 'BTCUSDT',
  fundingRate: 0,
  markPrice: 0,
  indexPrice: 0,
  nextFundingTime: 0,
  timestamp: 0,
};

export const DEFAULT_ORDERBOOK_DATA: OrderBookData = {
  symbol: 'BTCUSDT',
  bids: [],
  asks: [],
  lastUpdateId: 0,
  timestamp: 0,
};