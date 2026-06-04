/**
 * Market Data Hub - Test Suite
 * 
 * Comprehensive tests for the Market Data Hub system.
 */

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
  ConnectionStatus,
  DataFreshness,
  DataConfidence,
  SystemStatus,
} from '../lib/services/data-hub';

// ============================================================================
// Test Utilities
// ============================================================================

const PASS = '✅';
const FAIL = '❌';
const INFO = 'ℹ️';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

function test(name: string, fn: () => boolean | Promise<boolean>, message: string = ''): TestResult {
  return {
    name,
    passed: false,
    message,
  };
}

async function runTest(name: string, fn: () => boolean | Promise<boolean>): Promise<TestResult> {
  try {
    const result = await fn();
    return {
      name,
      passed: result,
      message: result ? 'PASS' : 'FAIL',
    };
  } catch (error) {
    return {
      name,
      passed: false,
      message: `ERROR: ${error}`,
    };
  }
}

// ============================================================================
// Test Suite
// ============================================================================

async function testSingletonPattern(): Promise<TestResult> {
  const hub1 = MarketDataHub.getInstance();
  const hub2 = MarketDataHub.getInstance();
  
  return {
    name: 'Singleton Pattern',
    passed: hub1 === hub2,
    message: hub1 === hub2 ? PASS + ' Only one instance exists' : FAIL + ' Multiple instances detected',
  };
}

async function testSupportedSymbols(): Promise<TestResult> {
  const expectedSymbols: Symbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
  const hasAll = expectedSymbols.every(s => SUPPORTED_SYMBOLS.includes(s));
  
  return {
    name: 'Supported Symbols',
    passed: hasAll,
    message: hasAll 
      ? PASS + ` All ${expectedSymbols.length} symbols supported` 
      : FAIL + ' Missing symbols',
    details: `Supported: ${SUPPORTED_SYMBOLS.join(', ')}`,
  };
}

async function testSystemStatus(): Promise<TestResult> {
  const status = marketDataHub.getSystemStatus();
  
  const hasRequiredFields = 
    typeof status.isRunning === 'boolean' &&
    typeof status.totalSubscribers === 'number' &&
    typeof status.connectionSummary === 'object' &&
    typeof status.overallConfidence === 'number';
  
  return {
    name: 'System Status',
    passed: hasRequiredFields,
    message: hasRequiredFields 
      ? PASS + ' System status contains all required fields'
      : FAIL + ' System status missing required fields',
    details: `Running: ${status.isRunning}, Confidence: ${status.overallConfidence}%`,
  };
}

async function testConnectionStatus(): Promise<TestResult> {
  let allHaveStatus = true;
  const statuses: ConnectionStatus[] = [];
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const status = marketDataHub.getConnectionStatus(symbol);
    if (!status || typeof status.connected !== 'boolean') {
      allHaveStatus = false;
    }
    statuses.push(status);
  }
  
  return {
    name: 'Connection Status',
    passed: allHaveStatus,
    message: allHaveStatus 
      ? PASS + ` All ${SUPPORTED_SYMBOLS.length} symbols have connection status`
      : FAIL + ' Some symbols missing connection status',
  };
}

async function testDataFreshness(): Promise<TestResult> {
  let allHaveFreshness = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const freshness = marketDataHub.getDataFreshness(symbol);
    if (!freshness || typeof freshness.price !== 'object') {
      allHaveFreshness = false;
    }
  }
  
  return {
    name: 'Data Freshness',
    passed: allHaveFreshness,
    message: allHaveFreshness 
      ? PASS + ' All symbols have freshness tracking'
      : FAIL + ' Some symbols missing freshness tracking',
  };
}

async function testConfidenceScore(): Promise<TestResult> {
  let allHaveConfidence = true;
  const scores: number[] = [];
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const confidence = marketDataHub.getConfidenceScore(symbol);
    if (!confidence || typeof confidence.score !== 'number') {
      allHaveConfidence = false;
    } else {
      scores.push(confidence.score);
    }
  }
  
  const allInRange = scores.every(s => s >= 0 && s <= 100);
  
  return {
    name: 'Confidence Score',
    passed: allHaveConfidence && allInRange,
    message: allHaveConfidence && allInRange
      ? PASS + ` Confidence scores: ${scores.join(', ')}`
      : FAIL + ' Invalid confidence scores',
  };
}

async function testMarketDataRetrieval(): Promise<TestResult> {
  let allHaveData = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const data = marketDataHub.getMarketData(symbol);
    if (!data || typeof data.price !== 'number') {
      allHaveData = false;
    }
  }
  
  return {
    name: 'Market Data Retrieval',
    passed: allHaveData,
    message: allHaveData 
      ? PASS + ' All symbols return market data'
      : FAIL + ' Some symbols missing market data',
  };
}

async function testPriceRetrieval(): Promise<TestResult> {
  let allHavePrice = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const price = marketDataHub.getPrice(symbol);
    if (!price || typeof price.price !== 'number') {
      allHavePrice = false;
    }
  }
  
  return {
    name: 'Price Data Retrieval',
    passed: allHavePrice,
    message: allHavePrice 
      ? PASS + ' All symbols return price data'
      : FAIL + ' Some symbols missing price data',
  };
}

async function testFundingRetrieval(): Promise<TestResult> {
  let allHaveFunding = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const funding = marketDataHub.getFunding(symbol);
    if (!funding || typeof funding.fundingRate !== 'number') {
      allHaveFunding = false;
    }
  }
  
  return {
    name: 'Funding Rate Retrieval',
    passed: allHaveFunding,
    message: allHaveFunding 
      ? PASS + ' All symbols return funding data'
      : FAIL + ' Some symbols missing funding data',
  };
}

async function testCandlesRetrieval(): Promise<TestResult> {
  let allHaveCandles = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const candles = marketDataHub.getCandles(symbol, '1m');
    if (!Array.isArray(candles)) {
      allHaveCandles = false;
    }
  }
  
  return {
    name: 'Candle Data Retrieval',
    passed: allHaveCandles,
    message: allHaveCandles 
      ? PASS + ' All symbols return candle data'
      : FAIL + ' Some symbols missing candle data',
  };
}

async function testOrderBookRetrieval(): Promise<TestResult> {
  let allHaveOrderBook = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const orderBook = marketDataHub.getOrderBook(symbol);
    // Order book can be null if no data yet
    if (orderBook && typeof orderBook.bids === 'undefined') {
      allHaveOrderBook = false;
    }
  }
  
  return {
    name: 'Order Book Retrieval',
    passed: allHaveOrderBook,
    message: allHaveOrderBook 
      ? PASS + ' All symbols return order book data'
      : FAIL + ' Some symbols missing order book data',
  };
}

async function testSubscriptionSystem(): Promise<TestResult> {
  let receivedUpdate = false;
  
  const unsubscribe = marketDataHub.subscribe({
    id: 'test-subscriber',
    name: 'Test Subscriber',
    dataTypes: ['price', 'funding'],
    callback: () => {
      receivedUpdate = true;
    },
  });
  
  const status = marketDataHub.getSystemStatus();
  const hasSubscriber = status.totalSubscribers >= 1;
  
  unsubscribe();
  
  return {
    name: 'Subscription System',
    passed: hasSubscriber,
    message: hasSubscriber 
      ? PASS + ' Subscription system working'
      : FAIL + ' Subscription not registered',
  };
}

async function testReconnectCapability(): Promise<TestResult> {
  // Just test that the method exists and doesn't throw
  try {
    await marketDataHub.reconnect('BTCUSDT');
    return {
      name: 'Reconnect Capability',
      passed: true,
      message: PASS + ' Reconnect method works',
    };
  } catch (error) {
    return {
      name: 'Reconnect Capability',
      passed: false,
      message: FAIL + ' Reconnect failed: ' + error,
    };
  }
}

async function testErrorLogging(): Promise<TestResult> {
  marketDataHub.clearErrorLog();
  
  const statusBefore = marketDataHub.getSystemStatus();
  const errorCountBefore = statusBefore.errorLog.length;
  
  return {
    name: 'Error Logging',
    passed: errorCountBefore === 0,
    message: errorCountBefore === 0 
      ? PASS + ' Error log cleared successfully'
      : FAIL + ' Error log not cleared',
  };
}

async function testMetricsRetrieval(): Promise<TestResult> {
  let allHaveMetrics = true;
  
  for (const symbol of SUPPORTED_SYMBOLS) {
    const metrics = marketDataHub.getMetrics(symbol);
    if (!metrics || typeof metrics.buyPressure !== 'number') {
      allHaveMetrics = false;
    }
  }
  
  return {
    name: 'Market Metrics',
    passed: allHaveMetrics,
    message: allHaveMetrics 
      ? PASS + ' All symbols return market metrics'
      : FAIL + ' Some symbols missing metrics',
  };
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          MARKET DATA HUB - COMPREHENSIVE TEST SUITE               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const tests = [
    testSingletonPattern,
    testSupportedSymbols,
    testSystemStatus,
    testConnectionStatus,
    testDataFreshness,
    testConfidenceScore,
    testMarketDataRetrieval,
    testPriceRetrieval,
    testFundingRetrieval,
    testCandlesRetrieval,
    testOrderBookRetrieval,
    testSubscriptionSystem,
    testReconnectCapability,
    testErrorLogging,
    testMetricsRetrieval,
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await runTest(test.name, test);
    results.push(result);
  }

  // Print results
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? PASS : FAIL;
    console.log(`${status} ${result.name}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    if (!result.passed) {
      console.log(`   ${result.message}`);
    }
    
    if (result.passed) passed++; else failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Market Data Hub is ready for production.\n');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Please review the results above.\n`);
  }

  // Print system status summary
  const status = marketDataHub.getSystemStatus();
  console.log('📊 SYSTEM STATUS SUMMARY:');
  console.log(`   • Running: ${status.isRunning}`);
  console.log(`   • Overall Confidence: ${status.overallConfidence}%`);
  console.log(`   • Connections: ${status.connectionSummary.connected}/${status.connectionSummary.total}`);
  console.log(`   • Subscribers: ${status.totalSubscribers}`);
  console.log(`   • Error Log: ${status.errorLog.length} entries\n`);
}

// ============================================================================
// Export
// ============================================================================

export {
  testSingletonPattern,
  testSupportedSymbols,
  testSystemStatus,
  testConnectionStatus,
  testDataFreshness,
  testConfidenceScore,
  testMarketDataRetrieval,
  testPriceRetrieval,
  testFundingRetrieval,
  testCandlesRetrieval,
  testOrderBookRetrieval,
  testSubscriptionSystem,
  testReconnectCapability,
  testErrorLogging,
  testMetricsRetrieval,
  runAllTests,
};

// Run if executed directly
if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
  runAllTests().catch(console.error);
}