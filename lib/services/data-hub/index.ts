/**
 * Market Data Hub - Service Index
 * 
 * All market data operations go through these exports.
 * This is the ONLY entry point for market data.
 * 
 * Usage:
 * import { marketDataHub } from '@/lib/services/data-hub';
 * 
 * The hub receives data from external sources (like RealtimeDataContext)
 * and provides a unified interface for all consumers.
 */

export { marketDataHub, MarketDataHub, default } from './market-data-hub';
export * from './types';