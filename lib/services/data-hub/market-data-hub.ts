/**
 * MarketDataHub - Centralized Market Data Service
 * 
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all market data.
 * 
 * STRICT RULE: No page, feature, or component should call Binance directly.
 * ALL requests must go through this MarketDataHub.
 * 
 * This class provides a unified interface for accessing market data.
 * It aggregates data from various sources (RealtimeDataContext, etc.)
 * and provides consistent types and caching.
 */

import {
  Symbol,
  SUPPORTED_SYMBOLS,
  MarketData,
  PriceData,
  CandleData,
  OrderBookData,
  FundingData,
  TradeEntry,
  ConnectionStatus,
  DataFreshness,
  DataConfidence,
  MarketDataUpdate,
  Subscriber,
  DataType,
  SystemStatus,
  ErrorEntry,
  MarketMetrics,
  DEFAULT_MARKET_DATA,
} from './types';

/**
 * MarketDataHub - Singleton service for centralized market data access
 * 
 * This service provides:
 * - Unified data access interface
 * - Data validation and consistency
 * - Freshness tracking
 * - Confidence scoring
 * - Subscription system for real-time updates
 */
class MarketDataHubService {
  private static instance: MarketDataHubService | null = null;
  
  // State
  private subscribers: Map<string, Subscriber> = new Map();
  private marketDataCache: Map<Symbol, MarketData> = new Map();
  private connectionStatus: Map<Symbol, ConnectionStatus> = new Map();
  private dataFreshness: Map<Symbol, DataFreshness> = new Map();
  private confidenceScores: Map<Symbol, DataConfidence> = new Map();
  private errorLog: ErrorEntry[] = [];
  private isRunning: boolean = false;
  
  // Private constructor for singleton
  private constructor() {
    this.initializeStates();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): MarketDataHubService {
    if (!MarketDataHubService.instance) {
      MarketDataHubService.instance = new MarketDataHubService();
    }
    return MarketDataHubService.instance;
  }

  /**
   * Initialize states for all supported symbols
   */
  private initializeStates(): void {
    for (const symbol of SUPPORTED_SYMBOLS) {
      this.marketDataCache.set(symbol, { ...DEFAULT_MARKET_DATA, symbol });
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
  // PUBLIC API - Data Access
  // ============================================================================

  /**
   * Update market data from an external source (like RealtimeDataContext)
   * This is the main method external sources should call to update data
   */
  public updateMarketData(symbol: Symbol, data: Partial<MarketData>): void {
    const cached = this.marketDataCache.get(symbol) || { ...DEFAULT_MARKET_DATA, symbol };
    const now = Date.now();
    
    // Update cache
    this.marketDataCache.set(symbol, { ...cached, ...data, lastUpdate: now });

    // Update freshness
    if (data.price !== undefined) {
      this.updateFreshness(symbol, 'price', now);
    }
    if (data.orderBook) {
      this.updateFreshness(symbol, 'orderBook', now);
    }
    if (data.fundingRate !== undefined) {
      this.updateFreshness(symbol, 'funding', now);
    }

    // Update connection status
    this.updateConnectionStatus(symbol, true);

    // Update confidence score
    this.updateConfidenceScore(symbol);

    // Distribute update to subscribers
    this.distributeUpdate({ type: 'price', symbol, data, timestamp: now, confidence: this.getConfidenceScore(symbol).score });
  }

  /**
   * Get complete market data for a symbol
   */
  public getMarketData(symbol: Symbol): MarketData {
    return this.marketDataCache.get(symbol) || { ...DEFAULT_MARKET_DATA, symbol };
  }

  /**
   * Get price data
   */
  public getPrice(symbol: Symbol): PriceData | null {
    const data = this.marketDataCache.get(symbol);
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
    const data = this.marketDataCache.get(symbol);
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
    const data = this.marketDataCache.get(symbol);
    return data?.orderBook || null;
  }

  /**
   * Get candle data for an interval
   */
  public getCandles(symbol: Symbol, interval: string): CandleData[] {
    const data = this.marketDataCache.get(symbol);
    return data?.candles[interval] || [];
  }

  /**
   * Get recent trades
   */
  public getTrades(symbol: Symbol): TradeEntry[] {
    const data = this.marketDataCache.get(symbol);
    return data?.trades || [];
  }

  /**
   * Get market metrics
   */
  public getMetrics(symbol: Symbol): MarketMetrics {
    const data = this.marketDataCache.get(symbol);
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

  // ============================================================================
  // PUBLIC API - Status
  // ============================================================================

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

  // ============================================================================
  // PUBLIC API - Subscription
  // ============================================================================

  /**
   * Subscribe to market data updates
   */
  public subscribe(subscriber: Subscriber): () => void {
    this.subscribers.set(subscriber.id, subscriber);
    return () => {
      this.subscribers.delete(subscriber.id);
    };
  }

  /**
   * Start the service
   */
  public start(): void {
    this.isRunning = true;
  }

  /**
   * Stop the service
   */
  public stop(): void {
    this.isRunning = false;
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private updateFreshness(symbol: Symbol, dataType: keyof DataFreshness, timestamp: number): void {
    const freshness = this.dataFreshness.get(symbol);
    if (freshness) {
      freshness[dataType] = timestamp;
    }
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

  private distributeUpdate(update: MarketDataUpdate): void {
    for (const [_, subscriber] of this.subscribers) {
      if (subscriber.dataTypes.includes(update.type)) {
        try {
          subscriber.callback(update);
        } catch (error) {
          console.error(`[MarketDataHub] Subscriber callback error:`, error);
        }
      }
    }
  }

  private logError(message: string, symbol?: Symbol): void {
    const error = { timestamp: Date.now(), message, symbol };
    this.errorLog.push(error);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }
}

// Export singleton
export const marketDataHub = MarketDataHubService.getInstance();

// Export class for type checking
export { MarketDataHubService as MarketDataHub };

// Default export
export default marketDataHub;