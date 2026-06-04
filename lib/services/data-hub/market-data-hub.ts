/**
 * MarketDataHub - Centralized Market Data Service
 * 
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all market data.
 * 
 * STRICT RULE: No page, feature, or component should call Binance directly.
 * ALL requests must go through this MarketDataHub.
 * 
 * This eliminates:
 * - Data mismatches
 * - Price inconsistencies
 * - Volume inconsistencies
 * - Signal discrepancies
 * - Order book discrepancies
 * - Funding discrepancies
 * - Open interest discrepancies
 */

import {
  Symbol,
  SUPPORTED_SYMBOLS,
  MarketData,
  PriceData,
  CandleData,
  OrderBookData,
  FundingData,
  OpenInterestData,
  TradeEntry,
  ConnectionStatus,
  DataFreshness,
  DataConfidence,
  MarketDataUpdate,
  Subscriber,
  DataType,
  SystemStatus,
  ErrorEntry,
  DataHubConfig,
  MarketMetrics,
  DEFAULT_MARKET_DATA,
  DEFAULT_CONFIG,
} from './types';

/**
 * Data Cache - Intelligent caching with configurable timeouts
 */
class DataCache {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private timeouts: Map<string, number> = new Map();

  constructor() {
    // Set default timeouts
    this.timeouts.set('price', 5000);
    this.timeouts.set('orderbook', 3000);
    this.timeouts.set('funding', 30000);
    this.timeouts.set('openInterest', 30000);
    this.timeouts.set('candle', 60000);
    this.timeouts.set('trade', 0); // Real-time
  }

  set(key: string, data: unknown, type: string): void {
    const timeout = this.timeouts.get(type) ?? 5000;
    this.cache.set(key, { data, timestamp: Date.now() + timeout });
  }

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.timestamp < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  getAge(key: string): number | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return Date.now() - (entry.timestamp - this.timeouts.get(key.split(':')[0]) ?? 5000);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Data Validator - Ensures data consistency
 */
class DataValidator {
  validatePrice(data: Partial<PriceData>): boolean {
    if (!data.price || data.price <= 0) return false;
    if (data.priceChangePercent !== undefined && Math.abs(data.priceChangePercent) > 50) return false;
    if (data.high24h !== undefined && data.low24h !== undefined && data.high24h < data.low24h) return false;
    return true;
  }

  validateFunding(data: Partial<FundingData>): boolean {
    if (data.fundingRate !== undefined && (data.fundingRate < -0.1 || data.fundingRate > 0.1)) return false;
    return true;
  }

  validateOrderBook(data: OrderBookData): boolean {
    if (!data.bids || !data.asks) return false;
    if (data.bids.length === 0 || data.asks.length === 0) return false;
    if (data.bids[0].price >= data.asks[0].price) return false;
    return true;
  }
}

/**
 * MarketDataHub - Singleton market data service
 * 
 * This is the ONLY module that should connect to Binance directly.
 * All other modules MUST use this hub to get market data.
 */
export class MarketDataHub {
  private static instance: MarketDataHub | null = null;
  
  // Core components
  private cache: DataCache;
  private validator: DataValidator;
  
  // State
  private subscribers: Map<string, Subscriber> = new Map();
  private marketData: Map<Symbol, MarketData> = new Map();
  private connectionStatus: Map<Symbol, ConnectionStatus> = new Map();
  private dataFreshness: Map<Symbol, DataFreshness> = new Map();
  private confidenceScores: Map<Symbol, DataConfidence> = new Map();
  private errorLog: ErrorEntry[] = [];
  private isRunning: boolean = false;
  
  // Configuration
  private config: DataHubConfig;
  
  // WebSocket connections
  private wsConnections: Map<Symbol, WebSocket[]> = new Map();
  private reconnectTimers: Map<Symbol, ReturnType<typeof setTimeout>> = new Map();
  
  // Private constructor for singleton
  private constructor(config: DataHubConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.cache = new DataCache();
    this.validator = new DataValidator();
    this.initializeStates();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): MarketDataHub {
    if (!MarketDataHub.instance) {
      MarketDataHub.instance = new MarketDataHub();
    }
    return MarketDataHub.instance;
  }

  /**
   * Initialize states for all supported symbols
   */
  private initializeStates(): void {
    for (const symbol of SUPPORTED_SYMBOLS) {
      this.marketData.set(symbol, { ...DEFAULT_MARKET_DATA, symbol });
      this.connectionStatus.set(symbol, {
        connected: false,
        lastConnected: null,
        lastDisconnected: null,
        reconnectAttempts: 0,
        errorCount: 0,
      });
      this.dataFreshness.set(symbol, {
        price: null,
        orderBook: null,
        funding: null,
        openInterest: null,
        volume: null,
        trades: null,
      });
      this.confidenceScores.set(symbol, {
        score: 100,
        connectionHealth: 100,
        dataFreshness: 100,
        synchronization: 100,
        errorRate: 100,
        latency: 0,
      });
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Start the Market Data Hub
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MarketDataHub] Already running');
      return;
    }

    console.log('[MarketDataHub] Starting...');
    this.isRunning = true;

    // Connect to Binance for all symbols
    for (const symbol of SUPPORTED_SYMBOLS) {
      this.connectSymbol(symbol);
    }

    console.log('[MarketDataHub] Started successfully');
  }

  /**
   * Stop the Market Data Hub
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[MarketDataHub] Stopping...');
    this.isRunning = false;

    // Close all WebSocket connections
    for (const [symbol, wsList] of this.wsConnections) {
      for (const ws of wsList) {
        ws.close();
      }
    }
    this.wsConnections.clear();

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    console.log('[MarketDataHub] Stopped');
  }

  /**
   * Subscribe to market data updates
   */
  public subscribe(subscriber: Subscriber): () => void {
    this.subscribers.set(subscriber.id, subscriber);
    console.log(`[MarketDataHub] Subscriber added: ${subscriber.name}`);
    
    return () => {
      this.subscribers.delete(subscriber.id);
      console.log(`[MarketDataHub] Subscriber removed: ${subscriber.name}`);
    };
  }

  /**
   * Get complete market data for a symbol
   */
  public getMarketData(symbol: Symbol): MarketData {
    return this.marketData.get(symbol) || { ...DEFAULT_MARKET_DATA, symbol };
  }

  /**
   * Get price data
   */
  public getPrice(symbol: Symbol): PriceData | null {
    const data = this.marketData.get(symbol);
    if (!data) return null;
    return {
      symbol,
      price: data.price,
      priceChange: data.priceChange,
      priceChangePercent: data.priceChangePercent,
      high24h: data.high24h,
      low24h: data.low24h,
      volume24h: data.quoteVolume,
      quoteVolume24h: data.quoteVolume,
      timestamp: data.lastUpdate,
    };
  }

  /**
   * Get funding data
   */
  public getFunding(symbol: Symbol): FundingData | null {
    const data = this.marketData.get(symbol);
    if (!data) return null;
    return {
      symbol,
      fundingRate: data.fundingRate,
      markPrice: data.markPrice,
      indexPrice: data.indexPrice,
      nextFundingTime: data.nextFundingTime,
      timestamp: data.lastUpdate,
    };
  }

  /**
   * Get order book data
   */
  public getOrderBook(symbol: Symbol): OrderBookData | null {
    const data = this.marketData.get(symbol);
    return data?.orderBook || null;
  }

  /**
   * Get candle data for an interval
   */
  public getCandles(symbol: Symbol, interval: string): CandleData[] {
    const data = this.marketData.get(symbol);
    return data?.candles[interval] || [];
  }

  /**
   * Get recent trades
   */
  public getTrades(symbol: Symbol): TradeEntry[] {
    const data = this.marketData.get(symbol);
    return data?.trades || [];
  }

  /**
   * Get market metrics
   */
  public getMetrics(symbol: Symbol): MarketMetrics {
    const data = this.marketData.get(symbol);
    return data?.metrics || {
      buyPressure: 50,
      sellPressure: 50,
      delta: 0,
      deltaUSD: 0,
      volumeImbalance: 0,
      bidDepthUSD: 0,
      askDepthUSD: 0,
    };
  }

  /**
   * Get connection status for a symbol
   */
  public getConnectionStatus(symbol: Symbol): ConnectionStatus {
    return this.connectionStatus.get(symbol) || {
      connected: false,
      lastConnected: null,
      lastDisconnected: null,
      reconnectAttempts: 0,
      errorCount: 0,
    };
  }

  /**
   * Get all connection statuses
   */
  public getAllConnectionStatus(): Map<Symbol, ConnectionStatus> {
    return new Map(this.connectionStatus);
  }

  /**
   * Get data freshness for a symbol
   */
  public getDataFreshness(symbol: Symbol): DataFreshness {
    return this.dataFreshness.get(symbol) || {
      price: null,
      orderBook: null,
      funding: null,
      openInterest: null,
      volume: null,
      trades: null,
    };
  }

  /**
   * Get data confidence score for a symbol
   */
  public getConfidenceScore(symbol: Symbol): DataConfidence {
    return this.confidenceScores.get(symbol) || {
      score: 0,
      connectionHealth: 0,
      dataFreshness: 0,
      synchronization: 0,
      errorRate: 0,
      latency: 0,
    };
  }

  /**
   * Get system status
   */
  public getSystemStatus(): SystemStatus {
    let connectedCount = 0;
    let disconnectedCount = 0;

    for (const [_, status] of this.connectionStatus) {
      if (status.connected) connectedCount++;
      else disconnectedCount++;
    }

    let totalConfidence = 0;
    for (const [_, score] of this.confidenceScores) {
      totalConfidence += score.score;
    }
    const overallConfidence = this.confidenceScores.size > 0 
      ? totalConfidence / this.confidenceScores.size 
      : 0;

    return {
      isRunning: this.isRunning,
      totalSubscribers: this.subscribers.size,
      connectionSummary: {
        connected: connectedCount,
        disconnected: disconnectedCount,
        total: SUPPORTED_SYMBOLS.length,
      },
      overallConfidence: Math.round(overallConfidence),
      errorLog: this.errorLog.slice(-50),
    };
  }

  /**
   * Force reconnection for a symbol
   */
  public async reconnect(symbol?: Symbol): Promise<void> {
    if (symbol) {
      console.log(`[MarketDataHub] Reconnecting ${symbol}...`);
      this.disconnectSymbol(symbol);
      this.connectSymbol(symbol);
    } else {
      console.log('[MarketDataHub] Reconnecting all symbols...');
      for (const sym of SUPPORTED_SYMBOLS) {
        this.disconnectSymbol(sym);
        this.connectSymbol(sym);
      }
    }
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
    console.log('[MarketDataHub] Error log cleared');
  }

  // ============================================================================
  // PRIVATE METHODS - WebSocket Connection
  // ============================================================================

  private connectSymbol(symbol: Symbol): void {
    const streams = [
      `${symbol.toLowerCase()}@aggTrade`,
      `${symbol.toLowerCase()}@markPrice@1s`,
      `${symbol.toLowerCase()}@depth20@100ms`,
      `${symbol.toLowerCase()}@kline_1m`,
    ];

    const wsUrl = `${this.config.binanceWsUrl}/${streams.join('/')}`;
    console.log(`[MarketDataHub] Connecting to ${symbol}...`);

    try {
      const ws = new WebSocket(wsUrl);
      const wsList = this.wsConnections.get(symbol) || [];
      wsList.push(ws);
      this.wsConnections.set(symbol, wsList);

      ws.onopen = () => {
        console.log(`[MarketDataHub] WebSocket opened for ${symbol}`);
        this.updateConnectionStatus(symbol, true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(symbol, message);
        } catch (error) {
          console.error(`[MarketDataHub] Failed to parse message for ${symbol}:`, error);
        }
      };

      ws.onerror = (error) => {
        console.error(`[MarketDataHub] WebSocket error for ${symbol}:`, error);
        this.logError(`WebSocket error for ${symbol}`, symbol);
      };

      ws.onclose = () => {
        console.log(`[MarketDataHub] WebSocket closed for ${symbol}`);
        this.updateConnectionStatus(symbol, false);
        this.scheduleReconnect(symbol);
      };

    } catch (error) {
      console.error(`[MarketDataHub] Failed to connect ${symbol}:`, error);
      this.logError(`Failed to connect ${symbol}: ${error}`, symbol);
      this.scheduleReconnect(symbol);
    }
  }

  private disconnectSymbol(symbol: Symbol): void {
    const wsList = this.wsConnections.get(symbol);
    if (wsList) {
      for (const ws of wsList) {
        ws.close();
      }
      this.wsConnections.delete(symbol);
    }

    const timer = this.reconnectTimers.get(symbol);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(symbol);
    }
  }

  private scheduleReconnect(symbol: Symbol): void {
    if (!this.isRunning) return;

    const status = this.connectionStatus.get(symbol);
    if (!status || status.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log(`[MarketDataHub] Max reconnection attempts reached for ${symbol}`);
      return;
    }

    status.reconnectAttempts++;
    const delay = this.config.reconnectInterval * status.reconnectAttempts;
    
    console.log(`[MarketDataHub] Reconnecting ${symbol} in ${delay}ms (attempt ${status.reconnectAttempts})`);

    const timer = setTimeout(() => {
      this.connectSymbol(symbol);
    }, delay);

    this.reconnectTimers.set(symbol, timer);
  }

  private handleMessage(symbol: Symbol, message: Record<string, unknown>): void {
    const eventType = message['e'] as string;
    
    switch (eventType) {
      case 'aggTrade':
        this.handleTrade(symbol, message);
        break;
      case 'markPriceUpdate':
        this.handleMarkPrice(symbol, message);
        break;
      case 'kline':
        this.handleKline(symbol, message);
        break;
      case 'depthUpdate':
        this.handleDepth(symbol, message);
        break;
      default:
        // Handle combined stream format
        if (message['stream'] && message['data']) {
          const stream = message['stream'] as string;
          const data = message['data'] as Record<string, unknown>;
          
          if (stream.includes('aggTrade')) {
            this.handleTrade(symbol, data);
          } else if (stream.includes('markPrice')) {
            this.handleMarkPrice(symbol, data);
          } else if (stream.includes('kline')) {
            this.handleKline(symbol, data);
          } else if (stream.includes('depth')) {
            this.handleDepth(symbol, data);
          }
        }
    }
  }

  private handleTrade(symbol: Symbol, data: Record<string, unknown>): void {
    const trade: TradeEntry = {
      symbol,
      time: data['T'] as number,
      price: parseFloat(data['p'] as string),
      quantity: parseFloat(data['q'] as string),
      isBuyerMaker: data['m'] as boolean,
      isTakerBuy: !data['m'],
      tradeId: data['a'] as number,
    };

    // Update market data
    const marketData = this.marketData.get(symbol);
    if (marketData) {
      marketData.price = trade.price;
      marketData.lastUpdate = Date.now();
      marketData.freshnessStatus = 'live';
      marketData.isConnected = true;

      // Add to trades (keep last 100)
      marketData.trades.push(trade);
      if (marketData.trades.length > 100) {
        marketData.trades = marketData.trades.slice(-100);
      }

      // Update metrics
      this.updateMetrics(symbol);
    }

    // Update freshness
    this.updateFreshness(symbol, 'price', Date.now());
    this.updateFreshness(symbol, 'trades', Date.now());

    // Distribute to subscribers
    this.distributeUpdate({ type: 'trade', symbol, data: trade, timestamp: Date.now(), confidence: this.getConfidenceScore(symbol).score });

    // Cache
    this.cache.set(`${symbol}:price`, trade.price, 'price');
  }

  private handleMarkPrice(symbol: Symbol, data: Record<string, unknown>): void {
    const markPrice = parseFloat(data['p'] as string);
    const indexPrice = parseFloat(data['i'] as string);
    const fundingRate = parseFloat(data['r'] as string);
    const nextFundingTime = data['T'] as number;

    const marketData = this.marketData.get(symbol);
    if (marketData) {
      marketData.markPrice = markPrice;
      marketData.indexPrice = indexPrice;
      marketData.fundingRate = fundingRate;
      marketData.nextFundingTime = nextFundingTime;
    }

    this.updateFreshness(symbol, 'funding', Date.now());
    this.distributeUpdate({ type: 'markPrice', symbol, data: { markPrice, indexPrice, fundingRate, nextFundingTime }, timestamp: Date.now(), confidence: this.getConfidenceScore(symbol).score });

    this.cache.set(`${symbol}:funding`, { markPrice, indexPrice, fundingRate, nextFundingTime }, 'funding');
  }

  private handleKline(symbol: Symbol, data: Record<string, unknown>): void {
    const kline = data['k'] as Record<string, unknown>;
    const interval = kline['i'] as string;
    
    const candle: CandleData = {
      symbol,
      interval,
      openTime: kline['t'] as number,
      open: parseFloat(kline['o'] as string),
      high: parseFloat(kline['h'] as string),
      low: parseFloat(kline['l'] as string),
      close: parseFloat(kline['c'] as string),
      volume: parseFloat(kline['v'] as string),
      takerBuyVolume: parseFloat(kline['V'] as string),
      closeTime: kline['T'] as number,
      isClosed: kline['x'] as boolean,
    };

    const marketData = this.marketData.get(symbol);
    if (marketData) {
      if (!marketData.candles[interval]) {
        marketData.candles[interval] = [];
      }
      
      const existingIndex = marketData.candles[interval].findIndex(c => c.openTime === candle.openTime);
      if (existingIndex >= 0) {
        marketData.candles[interval][existingIndex] = candle;
      } else {
        marketData.candles[interval].push(candle);
      }

      // Keep only last 500 candles per interval
      if (marketData.candles[interval].length > 500) {
        marketData.candles[interval] = marketData.candles[interval].slice(-500);
      }
    }

    this.distributeUpdate({ type: 'candle', symbol, data: candle, timestamp: Date.now(), confidence: this.getConfidenceScore(symbol).score });
  }

  private handleDepth(symbol: Symbol, data: Record<string, unknown>): void {
    const bids = (data['b'] as [string, string][])?.map(([p, q]) => ({
      price: parseFloat(p),
      quantity: parseFloat(q),
      total: 0,
    })) || [];
    
    const asks = (data['a'] as [string, string][])?.map(([p, q]) => ({
      price: parseFloat(p),
      quantity: parseFloat(q),
      total: 0,
    })) || [];

    // Calculate totals
    let bidTotal = 0;
    bids.forEach(b => { bidTotal += b.quantity * b.price; b.total = bidTotal; });
    
    let askTotal = 0;
    asks.forEach(a => { askTotal += a.quantity * a.price; a.total = askTotal; });

    const marketData = this.marketData.get(symbol);
    if (marketData) {
      marketData.orderBook = {
        symbol,
        bids,
        asks,
        lastUpdateId: data['u'] as number,
        timestamp: Date.now(),
      };
    }

    this.updateFreshness(symbol, 'orderBook', Date.now());
    this.updateMetrics(symbol);
    this.distributeUpdate({ type: 'orderbook', symbol, data: marketData?.orderBook, timestamp: Date.now(), confidence: this.getConfidenceScore(symbol).score });
  }

  private updateMetrics(symbol: Symbol): void {
    const marketData = this.marketData.get(symbol);
    if (!marketData || !marketData.orderBook) return;

    const now = Date.now();
    const recentTrades = marketData.trades.filter(t => now - t.time < 30000);
    
    if (recentTrades.length === 0) {
      marketData.metrics = {
        buyPressure: 50,
        sellPressure: 50,
        delta: 0,
        deltaUSD: 0,
        volumeImbalance: 0,
        bidDepthUSD: marketData.orderBook.bids[0]?.total || 0,
        askDepthUSD: marketData.orderBook.asks[0]?.total || 0,
      };
      return;
    }

    const buyVol = recentTrades.filter(t => t.isTakerBuy).reduce((s, t) => s + t.quantity, 0);
    const sellVol = recentTrades.filter(t => !t.isTakerBuy).reduce((s, t) => s + t.quantity, 0);
    const totalVol = buyVol + sellVol;
    
    const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
    const lastPrice = recentTrades[recentTrades.length - 1]?.price || 1;

    marketData.metrics = {
      buyPressure: Math.round(Math.min(100, buyPct * 1.2)),
      sellPressure: Math.round(Math.min(100, (100 - buyPct) * 1.2)),
      delta: buyVol - sellVol,
      deltaUSD: (buyVol - sellVol) * lastPrice,
      volumeImbalance: totalVol > 0 ? ((buyVol - sellVol) / totalVol) * 100 : 0,
      bidDepthUSD: marketData.orderBook.bids[0]?.total || 0,
      askDepthUSD: marketData.orderBook.asks[0]?.total || 0,
    };
  }

  private updateConnectionStatus(symbol: Symbol, connected: boolean): void {
    const status = this.connectionStatus.get(symbol);
    if (status) {
      if (connected) {
        status.lastConnected = Date.now();
        status.reconnectAttempts = 0;
      } else {
        status.lastDisconnected = Date.now();
      }
      status.connected = connected;
    }
    this.updateConfidenceScore(symbol);
  }

  private updateFreshness(symbol: Symbol, dataType: keyof DataFreshness, timestamp: number): void {
    const freshness = this.dataFreshness.get(symbol);
    if (freshness) {
      freshness[dataType] = timestamp;
    }
  }

  private updateConfidenceScore(symbol: Symbol): void {
    const status = this.connectionStatus.get(symbol);
    const freshness = this.dataFreshness.get(symbol);
    
    if (!status || !freshness) return;

    const connectionHealth = status.connected ? 100 : 0;
    
    // Calculate freshness score based on last updates
    let freshnessScore = 100;
    const now = Date.now();
    
    if (freshness.price !== null) {
      const age = now - freshness.price;
      if (age > 5000) freshnessScore -= 30;
      if (age > 10000) freshnessScore -= 30;
      if (age > 30000) freshnessScore -= 20;
      freshnessScore = Math.max(0, freshnessScore);
    }

    const errorRateScore = Math.max(0, 100 - status.errorCount * 10);

    const score = Math.round(
      connectionHealth * 0.35 +
      freshnessScore * 0.25 +
      errorRateScore * 0.20 +
      100 * 0.10 +
      freshnessScore * 0.10
    );

    this.confidenceScores.set(symbol, {
      score,
      connectionHealth,
      dataFreshness: freshnessScore,
      synchronization: 100,
      errorRate: errorRateScore,
      latency: freshness.price ? now - freshness.price : 0,
    });
  }

  private logError(message: string, symbol?: Symbol): void {
    const error = { timestamp: Date.now(), message, symbol };
    this.errorLog.push(error);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }

    if (symbol) {
      const status = this.connectionStatus.get(symbol);
      if (status) status.errorCount++;
    }
  }

  private distributeUpdate(update: MarketDataUpdate): void {
    for (const [_, subscriber] of this.subscribers) {
      if (subscriber.dataTypes.includes(update.type) || subscriber.dataTypes.includes('price' as DataType)) {
        try {
          subscriber.callback(update);
        } catch (error) {
          console.error(`[MarketDataHub] Subscriber callback error:`, error);
        }
      }
    }
  }
}

// Singleton export
export const marketDataHub = MarketDataHub.getInstance();

// Default export
export default MarketDataHub;