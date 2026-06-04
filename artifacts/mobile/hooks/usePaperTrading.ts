/**
 * Paper Trading 3.0 - Professional Trading Laboratory
 * Enhanced with Market Regime, Kill Switch, Scalper/Normal Modes, and comprehensive analytics
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Constants ──────────────────────────────────────────────────── */

const STORAGE_KEY         = "paper_trading_v3";
const HISTORY_KEY         = "paper_trading_history_v3";
const EQUITY_KEY          = "paper_trading_equity_v3";
const SETTINGS_KEY        = "paper_trading_settings_v3";
export const STARTING_BALANCE = 100;
export const TAKER_FEE   = 0.0005;
export const MAKER_FEE   = 0.0002;
const MAINT_MARGIN       = 0.004;

/* ── Types ─────────────────────────────────────────────────────── */

export type PaperDirection = "LONG" | "SHORT";
export type ExitReason     = "manual" | "sl" | "tp" | "liquidation" | "breakeven";
export type OrderType      = "market" | "limit";
export type TradeMode      = "scalper" | "normal" | "manual";
export type TradeResult    = "win" | "loss" | "breakeven";

export const LEVERAGES = [1, 2, 3, 5, 10, 20, 50, 75, 100, 125] as const;
export type LeverageValue = typeof LEVERAGES[number];

export const PAPER_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"] as const;
export type PaperCoin = typeof PAPER_COINS[number];

export const COIN_LABEL: Record<PaperCoin, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", XRPUSDT: "XRP",
};

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;
export type Timeframe = typeof TIMEFRAMES[number];

export type MarketRegime =
  | "strong_bull" | "weak_bull" | "strong_bear" | "weak_bear"
  | "range_bound" | "high_volatility" | "low_volatility"
  | "breakout" | "reversal";

export const REGIME_LABELS: Record<MarketRegime, string> = {
  strong_bull:    "Strong Bull",
  weak_bull:      "Weak Bull",
  strong_bear:    "Strong Bear",
  weak_bear:      "Weak Bear",
  range_bound:    "Range Bound",
  high_volatility: "High Volatility",
  low_volatility:  "Low Volatility",
  breakout:       "Breakout",
  reversal:       "Reversal",
};

export interface PaperPosition {
  id: string;
  coin: PaperCoin;
  direction: PaperDirection;
  entryPrice: number;
  quantity: number;
  notional: number;
  margin: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  liquidationPrice: number;
  openedAt: number;
  entryFee: number;
  signalFollowed: boolean;
  orderType: OrderType;
  timeframe: Timeframe;
  mode: TradeMode;
  signalQuality: number;
  confidence: number;
  probability: number;
  marketRegime: MarketRegime;
  stopLossPct: number;
  takeProfitPct: number;
}

export interface PaperTrade {
  id: string;
  coin: PaperCoin;
  direction: PaperDirection;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  notional: number;
  leverage: number;
  margin: number;
  pnl: number;
  pnlPct: number;
  totalFees: number;
  duration: number;
  openedAt: number;
  closedAt: number;
  result: TradeResult;
  exitReason: ExitReason;
  signalFollowed: boolean;
  timeframe: Timeframe;
  mode: TradeMode;
  signalQuality: number;
  confidence: number;
  probability: number;
  marketRegime: MarketRegime;
  stopLoss: number | null;
  takeProfit: number | null;
  stopLossHit: boolean;
  takeProfitHit: boolean;
  tradeReview?: string;
}

export interface SignalStat {
  coin: PaperCoin;
  total: number;
  wins: number;
  totalPnl: number;
  avgQuality: number;
}

export interface ModeStats {
  mode: TradeMode;
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  avgDuration: number;
  avgWin: number;
  avgLoss: number;
}

export interface RegimeStats {
  regime: MarketRegime;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  avgDuration: number;
}

export interface EquitySnapshot {
  timestamp: number;
  balance: number;
  equity: number;
  openPositions: number;
  dailyPnl: number;
}

export interface KillSwitchConfig {
  maxConsecutiveLosses: number;
  maxDailyLoss: number;
  maxDailyDrawdown: number;
  maxWeeklyDrawdown: number;
  maxLosingTradesPerDay: number;
  recoveryMode: "manual" | "1hour" | "4hours" | "nextday" | "highqualitysignal";
  scalperLeverage: LeverageValue;
  normalLeverage: LeverageValue;
  riskPerTrade: number;
  maxDailyLossPct: number;
  maxWeeklyLossPct: number;
  maxDrawdownPct: number;
  maxConcurrentTrades: number;
  minProbability: number;
  minConfidence: number;
  minSignalQuality: number;
  allowedCoins: PaperCoin[];
  allowedTimeframes: Timeframe[];
  allowedDirection: "LONG" | "SHORT" | "BOTH";
  minRiskReward: number;
}

export interface TradeSettings {
  mode: TradeMode;
  killSwitchActive: boolean;
  killSwitchReason: string | null;
  killSwitchActivatedAt: number | null;
  lastResetAt: number;
  scalperLeverage: LeverageValue;
  normalLeverage: LeverageValue;
  riskPerTrade: number;
  autoPauseTrading: boolean;
}

export interface SignalFollowConfig {
  enabled: boolean;
  minProbability: number;
  minConfidence: number;
  minSignalQuality: number;
  allowedCoins: PaperCoin[];
  allowedTimeframes: Timeframe[];
  maxConcurrentTrades: number;
  maxDailyTrades: number;
  maxRiskPerTrade: number;
  minRiskReward: number;
  allowedDirection: "LONG" | "SHORT" | "BOTH";
  useScalperMode: boolean;
  useNormalMode: boolean;
}

export interface PersistedState {
  cashBalance: number;
  positions: PaperPosition[];
  settings: TradeSettings;
  signalStats: SignalStat[];
  modeStats: Record<TradeMode, ModeStats>;
  regimeStats: Record<MarketRegime, RegimeStats>;
}

/* ── Calculations ───────────────────────────────────────────────── */

export function calcLiquidation(entryPrice: number, leverage: number, direction: PaperDirection): number {
  return direction === "LONG"
    ? entryPrice * (1 - 1 / leverage + MAINT_MARGIN)
    : entryPrice * (1 + 1 / leverage - MAINT_MARGIN);
}

export function calcUnrealizedPnl(pos: PaperPosition, currentPrice: number): number {
  if (pos.direction === "LONG") return (currentPrice - pos.entryPrice) * pos.quantity;
  return (pos.entryPrice - currentPrice) * pos.quantity;
}

export function calcPnlPct(pnl: number, margin: number): number {
  return margin > 0 ? (pnl / margin) * 100 : 0;
}

function feeFor(notional: number, type: OrderType): number {
  return notional * (type === "market" ? TAKER_FEE : MAKER_FEE);
}

function genId(): string {
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const DEFAULT_MODE_STATS = (): Record<TradeMode, ModeStats> => ({
  scalper: { mode: "scalper", totalTrades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0, avgWin: 0, avgLoss: 0 },
  normal:  { mode: "normal",  totalTrades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0, avgWin: 0, avgLoss: 0 },
  manual:  { mode: "manual",  totalTrades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0, avgWin: 0, avgLoss: 0 },
});

const DEFAULT_REGIME_STATS = (): Record<MarketRegime, RegimeStats> => ({
  strong_bull:     { regime: "strong_bull",     totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  weak_bull:       { regime: "weak_bull",       totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  strong_bear:     { regime: "strong_bear",     totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  weak_bear:       { regime: "weak_bear",       totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  range_bound:     { regime: "range_bound",     totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  high_volatility: { regime: "high_volatility", totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  low_volatility:  { regime: "low_volatility",   totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  breakout:        { regime: "breakout",        totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
  reversal:        { regime: "reversal",        totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 },
});

const DEFAULT_SETTINGS: TradeSettings = {
  mode: "manual",
  killSwitchActive: false,
  killSwitchReason: null,
  killSwitchActivatedAt: null,
  lastResetAt: Date.now(),
  scalperLeverage: 10,
  normalLeverage: 5,
  riskPerTrade: 10,
  autoPauseTrading: false,
};

const DEFAULT_STATE: PersistedState = {
  cashBalance: STARTING_BALANCE,
  positions: [],
  settings: DEFAULT_SETTINGS,
  signalStats: [],
  modeStats: DEFAULT_MODE_STATS(),
  regimeStats: DEFAULT_REGIME_STATS(),
};

function getTradeMode(timeframe: Timeframe): TradeMode {
  if (timeframe === "1m" || timeframe === "5m" || timeframe === "15m") return "scalper";
  return "normal";
}

function generateTradeReview(trade: PaperTrade & { exitPrice: number; closedAt: number; duration: number; exitReason: ExitReason; totalFees: number; pnlPct: number }, prices: Record<PaperCoin, number>): string {
  const coin = COIN_LABEL[trade.coin];
  const direction = trade.direction === "LONG" ? "long" : "short";
  
  if (trade.result === "win") {
    const factors: string[] = [];
    if (trade.takeProfitHit) factors.push("Take profit target hit");
    if (trade.pnlPct > 10) factors.push("Excellent risk/reward execution");
    if (trade.signalQuality > 70) factors.push("High quality signal validated");
    if (trade.confidence > 75) factors.push("Strong market confirmation");
    
    return `WIN on ${coin} ${direction.toUpperCase()} @ ${trade.exitPrice.toFixed(2)}. ` +
      `P&L: ${trade.pnlPct.toFixed(1)}% ($${trade.pnl.toFixed(2)}). ` +
      `Quality: ${trade.signalQuality}/100, Confidence: ${trade.confidence}%. ` +
      (factors.length > 0 ? `Key factors: ${factors.slice(0, 3).join(", ")}.` : "");
  } else if (trade.result === "loss") {
    const factors: string[] = [];
    if (trade.stopLossHit) factors.push("Stop loss triggered");
    if (trade.pnlPct < -10) factors.push("Poor risk management");
    if (trade.signalQuality < 50) factors.push("Low quality entry signal");
    if (trade.probability < 60) factors.push("Low probability setup");
    
    return `LOSS on ${coin} ${direction.toUpperCase()} @ ${trade.exitPrice.toFixed(2)}. ` +
      `P&L: ${trade.pnlPct.toFixed(1)}% ($${Math.abs(trade.pnl).toFixed(2)}). ` +
      `Quality: ${trade.signalQuality}/100, Confidence: ${trade.confidence}%. ` +
      `Regime: ${REGIME_LABELS[trade.marketRegime]}. ` +
      (factors.length > 0 ? `Failure factors: ${factors.slice(0, 3).join(", ")}.` : "");
  } else {
    return `BREAKEVEN on ${coin} ${direction.toUpperCase()}. ` +
      `Minimal loss from fees. Signal quality: ${trade.signalQuality}/100.`;
  }
}

/* ── Hook ───────────────────────────────────────────────────────── */

export function usePaperTrading(prices: Record<PaperCoin, number>) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [equityHistory, setEquityHistory] = useState<EquitySnapshot[]>([]);
  const [fullHistory, setFullHistory] = useState<PaperTrade[]>([]);
  const [killSwitchConfig, setKillSwitchConfig] = useState<KillSwitchConfig>({
    maxConsecutiveLosses: 3,
    maxDailyLoss: 20,
    maxDailyDrawdown: 25,
    maxWeeklyDrawdown: 40,
    maxLosingTradesPerDay: 5,
    recoveryMode: "manual",
    scalperLeverage: 10,
    normalLeverage: 5,
    riskPerTrade: 10,
    maxDailyLossPct: 20,
    maxWeeklyLossPct: 30,
    maxDrawdownPct: 40,
    maxConcurrentTrades: 3,
    minProbability: 50,
    minConfidence: 50,
    minSignalQuality: 50,
    allowedCoins: [...PAPER_COINS],
    allowedTimeframes: [...TIMEFRAMES],
    allowedDirection: "BOTH",
    minRiskReward: 1.5,
  });
  const [signalFollowConfig, setSignalFollowConfig] = useState<SignalFollowConfig>({
    enabled: false,
    minProbability: 50,
    minConfidence: 50,
    minSignalQuality: 50,
    allowedCoins: [...PAPER_COINS],
    allowedTimeframes: [...TIMEFRAMES],
    maxConcurrentTrades: 3,
    maxDailyTrades: 10,
    maxRiskPerTrade: 10,
    minRiskReward: 1.5,
    allowedDirection: "BOTH",
    useScalperMode: true,
    useNormalMode: true,
  });
  
  const prevSignalRef = useRef<string>("WAIT");
  const dailyTradeCountRef = useRef(0);
  const lastDailyResetRef = useRef<string>(new Date().toDateString());

  /* ── Persistence ─────────────────────────────────────────────── */
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [stateRaw, historyRaw, equityRaw, settingsRaw, ksRaw, sfRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(EQUITY_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(`${STORAGE_KEY}_ks`),
          AsyncStorage.getItem(`${STORAGE_KEY}_sf`),
        ]);
        
        if (stateRaw) {
          const parsed = JSON.parse(stateRaw) as PersistedState;
          setState(prev => ({ ...prev, ...parsed }));
        }
        if (historyRaw) setFullHistory(JSON.parse(historyRaw));
        if (equityRaw) setEquityHistory(JSON.parse(equityRaw));
        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          setState(prev => ({ ...prev, settings: { ...DEFAULT_SETTINGS, ...settings } }));
        }
        if (ksRaw) setKillSwitchConfig(JSON.parse(ksRaw));
        if (sfRaw) setSignalFollowConfig(JSON.parse(sfRaw));
      } catch {}
      setLoaded(true);
    };
    loadAll();
  }, []);

  const persistState = useCallback((next: PersistedState) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const persistSettings = useCallback((settings: TradeSettings) => {
    setState(prev => ({ ...prev, settings }));
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, []);

  const persistHistory = useCallback((history: PaperTrade[]) => {
    setFullHistory(history);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
  }, []);

  const persistEquity = useCallback((equity: EquitySnapshot[]) => {
    setEquityHistory(equity);
    AsyncStorage.setItem(EQUITY_KEY, JSON.stringify(equity)).catch(() => {});
  }, []);

  const persistKillSwitchConfig = useCallback((config: KillSwitchConfig) => {
    setKillSwitchConfig(config);
    AsyncStorage.setItem(`${STORAGE_KEY}_ks`, JSON.stringify(config)).catch(() => {});
  }, []);

  const persistSignalFollowConfig = useCallback((config: SignalFollowConfig) => {
    setSignalFollowConfig(config);
    AsyncStorage.setItem(`${STORAGE_KEY}_sf`, JSON.stringify(config)).catch(() => {});
  }, []);

  /* ── Daily Reset Check ───────────────────────────────────────── */
  useEffect(() => {
    const today = new Date().toDateString();
    if (today !== lastDailyResetRef.current) {
      lastDailyResetRef.current = today;
      dailyTradeCountRef.current = 0;
    }
  }, []);

  /* ── Auto-close: SL / TP / Liquidation ──────────────────────── */
  useEffect(() => {
    if (!loaded) return;
    
    setState((prev) => {
      let changed = false;
      let cashBalance = prev.cashBalance;
      const remaining: PaperPosition[] = [];
      const newTrades: PaperTrade[] = [];
      const newSignalStats = [...prev.signalStats];
      const newModeStats = { ...prev.modeStats } as Record<TradeMode, ModeStats>;
      const newRegimeStats = { ...prev.regimeStats } as Record<MarketRegime, RegimeStats>;

      for (const pos of prev.positions) {
        const price = prices[pos.coin] ?? 0;
        if (price <= 0) { remaining.push(pos); continue; }

        const isLong  = pos.direction === "LONG";
        const hit_sl  = pos.stopLoss      != null && (isLong ? price <= pos.stopLoss  : price >= pos.stopLoss);
        const hit_tp  = pos.takeProfit    != null && (isLong ? price >= pos.takeProfit : price <= pos.takeProfit);
        const hit_liq = isLong ? price <= pos.liquidationPrice : price >= pos.liquidationPrice;

        if (hit_sl || hit_tp || hit_liq) {
          changed = true;
          const exitPrice  = hit_liq ? pos.liquidationPrice : hit_tp ? (pos.takeProfit ?? price) : (pos.stopLoss ?? price);
          const exitFee    = feeFor(exitPrice * pos.quantity, "market");
          const rawPnl     = isLong ? (exitPrice - pos.entryPrice) * pos.quantity : (pos.entryPrice - exitPrice) * pos.quantity;
          const totalFees  = pos.entryFee + exitFee;
          const pnl        = hit_liq ? -pos.margin : rawPnl - totalFees;
          const pnlPct     = calcPnlPct(pnl, pos.margin);
          const closedAt   = Date.now();
          const reason: ExitReason = hit_liq ? "liquidation" : hit_tp ? "tp" : "sl";
          
          const result: TradeResult = Math.abs(pnl) < 0.5 ? "breakeven" : pnl >= 0 ? "win" : "loss";
          
          cashBalance += pos.margin + pnl;

          const trade: PaperTrade = {
            id: pos.id, coin: pos.coin, direction: pos.direction,
            entryPrice: pos.entryPrice, exitPrice, quantity: pos.quantity,
            notional: pos.notional, leverage: pos.leverage, margin: pos.margin,
            pnl, pnlPct, totalFees, duration: closedAt - pos.openedAt,
            openedAt: pos.openedAt, closedAt, result,
            exitReason: reason, signalFollowed: pos.signalFollowed,
            timeframe: pos.timeframe, mode: pos.mode,
            signalQuality: pos.signalQuality, confidence: pos.confidence,
            probability: pos.probability, marketRegime: pos.marketRegime,
            stopLoss: pos.stopLoss, takeProfit: pos.takeProfit,
            stopLossHit: hit_sl, takeProfitHit: hit_tp,
            tradeReview: generateTradeReview({ ...pos, pnl, pnlPct, result, exitPrice, closedAt, duration: closedAt - pos.openedAt, exitReason: reason, totalFees, stopLossHit: hit_sl, takeProfitHit: hit_tp }, prices),
          };
          newTrades.push(trade);

          if (pos.signalFollowed) {
            const idx = newSignalStats.findIndex((s) => s.coin === pos.coin);
            if (idx >= 0) {
              newSignalStats[idx] = { 
                ...newSignalStats[idx], 
                total: newSignalStats[idx].total + 1, 
                wins: newSignalStats[idx].wins + (result === "win" ? 1 : 0),
                totalPnl: newSignalStats[idx].totalPnl + pnl,
                avgQuality: (newSignalStats[idx].avgQuality * newSignalStats[idx].total + pos.signalQuality) / (newSignalStats[idx].total + 1),
              };
            } else {
              newSignalStats.push({ coin: pos.coin, total: 1, wins: result === "win" ? 1 : 0, totalPnl: pnl, avgQuality: pos.signalQuality });
            }
          }

          const modeKey = pos.mode as TradeMode;
          if (!newModeStats[modeKey]) newModeStats[modeKey] = { mode: modeKey, totalTrades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0, avgWin: 0, avgLoss: 0 };
          newModeStats[modeKey].totalTrades++;
          if (result === "win") newModeStats[modeKey].wins++;
          else if (result === "loss") newModeStats[modeKey].losses++;
          else newModeStats[modeKey].breakeven++;
          newModeStats[modeKey].totalPnl += pnl;

          const regime = pos.marketRegime;
          if (!newRegimeStats[regime]) newRegimeStats[regime] = { regime, totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgDuration: 0 };
          newRegimeStats[regime].totalTrades++;
          if (result === "win") newRegimeStats[regime].wins++;
          else newRegimeStats[regime].losses++;
          newRegimeStats[regime].totalPnl += pnl;
        } else {
          remaining.push(pos);
        }
      }

      if (!changed) return prev;
      
      const combinedHistory = [...newTrades, ...fullHistory].slice(0, 1000);
      const next: PersistedState = {
        cashBalance: Math.max(0, cashBalance),
        positions: remaining,
        settings: prev.settings,
        signalStats: newSignalStats,
        modeStats: newModeStats,
        regimeStats: newRegimeStats,
      };
      
      persistState(next);
      persistHistory(combinedHistory);
      
      return next;
    });
  }, [prices, loaded, persistState, persistHistory, fullHistory]);

  /* ── Kill Switch Check ────────────────────────────────────────── */
  const checkKillSwitch = useCallback((currentState: PersistedState, todayTrades: PaperTrade[]): { activated: boolean; reason: string | null } => {
    if (currentState.settings.killSwitchActive) return { activated: true, reason: currentState.settings.killSwitchReason };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayPnL = todayTrades.filter(t => t.closedAt >= today.getTime()).reduce((s, t) => s + t.pnl, 0);
    const todayLosses = todayTrades.filter(t => t.closedAt >= today.getTime() && t.result === "loss").length;
    
    let currentStreak = 0;
    for (const t of todayTrades.slice().reverse()) {
      if (t.result === "win") { currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1; break; }
      else if (t.result === "loss") { currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1; break; }
    }

    const equity = currentState.cashBalance + currentState.positions.reduce((s, p) => s + p.margin, 0);
    const drawdown = ((STARTING_BALANCE - equity) / STARTING_BALANCE) * 100;

    if (killSwitchConfig.maxConsecutiveLosses > 0 && Math.abs(currentStreak) >= killSwitchConfig.maxConsecutiveLosses && currentStreak < 0) {
      return { activated: true, reason: `${Math.abs(currentStreak)} Consecutive Losses` };
    }
    if (killSwitchConfig.maxDailyLoss > 0 && todayPnL <= -killSwitchConfig.maxDailyLoss) {
      return { activated: true, reason: `Daily Loss $${Math.abs(todayPnL).toFixed(2)}` };
    }
    if (killSwitchConfig.maxDailyDrawdown > 0 && drawdown >= killSwitchConfig.maxDailyDrawdown) {
      return { activated: true, reason: `Drawdown ${drawdown.toFixed(1)}%` };
    }
    if (killSwitchConfig.maxLosingTradesPerDay > 0 && todayLosses >= killSwitchConfig.maxLosingTradesPerDay) {
      return { activated: true, reason: `${todayLosses} Losses Today` };
    }

    return { activated: false, reason: null };
  }, [killSwitchConfig]);

  /* ── Actions ─────────────────────────────────────────────────── */

  const openTrade = useCallback((params: {
    coin: PaperCoin;
    direction: PaperDirection;
    marginUSDT: number;
    leverage: LeverageValue;
    orderType?: OrderType;
    limitPrice?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
    signalFollowed?: boolean;
    timeframe?: Timeframe;
    signalQuality?: number;
    confidence?: number;
    probability?: number;
    marketRegime?: MarketRegime;
  }): string | null => {
    const {
      coin, direction, marginUSDT, leverage,
      orderType = "market", limitPrice, stopLoss = null, takeProfit = null,
      signalFollowed = false,
      timeframe = "15m",
      signalQuality = 0,
      confidence = 0,
      probability = 50,
      marketRegime = "range_bound",
    } = params;

    const entryPrice = orderType === "limit" && (limitPrice ?? 0) > 0 ? limitPrice! : prices[coin] ?? 0;

    if (entryPrice <= 0 || marginUSDT <= 0) return null;

    let result: string | null = null;
    setState((prev) => {
      if (prev.cashBalance < marginUSDT) return prev;
      if (prev.settings.killSwitchActive) return prev;
      
      const mode = getTradeMode(timeframe);
      const slPct = stopLoss ? Math.abs(stopLoss - entryPrice) / entryPrice : 0.015;
      const tpPct = takeProfit ? Math.abs(takeProfit - entryPrice) / entryPrice : 0.030;
      
      const id = genId();
      const notional = marginUSDT * leverage;
      const quantity = notional / entryPrice;
      const entryFee = feeFor(notional, orderType);
      const liqPrice = calcLiquidation(entryPrice, leverage, direction);

      const pos: PaperPosition = {
        id, coin, direction, entryPrice, quantity, notional,
        margin: marginUSDT, leverage, stopLoss, takeProfit,
        liquidationPrice: liqPrice, openedAt: Date.now(), entryFee,
        signalFollowed, orderType, timeframe, mode,
        signalQuality, confidence, probability, marketRegime,
        stopLossPct: slPct, takeProfitPct: tpPct,
      };

      const next: PersistedState = {
        ...prev,
        cashBalance: prev.cashBalance - marginUSDT,
        positions: [...prev.positions, pos],
      };
      persistState(next);
      result = id;
      dailyTradeCountRef.current++;
      return next;
    });
    return result;
  }, [prices, persistState]);

  const closeTrade = useCallback((positionId: string, reason: ExitReason) => {
    setState((prev) => {
      const pos = prev.positions.find((p) => p.id === positionId);
      if (!pos) return prev;

      const price = prices[pos.coin] ?? 0;
      const exitFee = feeFor(price * pos.quantity, "market");
      const rawPnl = pos.direction === "LONG" ? (price - pos.entryPrice) * pos.quantity : (pos.entryPrice - price) * pos.quantity;
      const pnl = rawPnl - pos.entryFee - exitFee;
      const pnlPct = calcPnlPct(pnl, pos.margin);
      const result: TradeResult = Math.abs(pnl) < 0.5 ? "breakeven" : pnl >= 0 ? "win" : "loss";
      const closedAt = Date.now();

      const trade: PaperTrade = {
        id: pos.id, coin: pos.coin, direction: pos.direction,
        entryPrice: pos.entryPrice, exitPrice: price, quantity: pos.quantity,
        notional: pos.notional, leverage: pos.leverage, margin: pos.margin,
        pnl, pnlPct, totalFees: pos.entryFee + exitFee,
        duration: closedAt - pos.openedAt, openedAt: pos.openedAt, closedAt,
        result, exitReason: reason, signalFollowed: pos.signalFollowed,
        timeframe: pos.timeframe, mode: pos.mode,
        signalQuality: pos.signalQuality, confidence: pos.confidence,
        probability: pos.probability, marketRegime: pos.marketRegime,
        stopLoss: pos.stopLoss, takeProfit: pos.takeProfit,
        stopLossHit: reason === "sl", takeProfitHit: reason === "tp",
        tradeReview: generateTradeReview({ ...pos, pnl, pnlPct, result, exitPrice: price, closedAt, duration: closedAt - pos.openedAt, exitReason: reason, totalFees: pos.entryFee + exitFee, stopLossHit: reason === "sl", takeProfitHit: reason === "tp" }, prices),
      };

      const newHistory = [trade, ...fullHistory].slice(0, 1000);
      const next: PersistedState = {
        ...prev,
        cashBalance: prev.cashBalance + pos.margin + pnl,
        positions: prev.positions.filter((p) => p.id !== positionId),
      };
      persistState(next);
      persistHistory(newHistory);
      return next;
    });
  }, [prices, persistState, persistHistory, fullHistory]);

  const moveStopLoss = useCallback((positionId: string, newSL: number) => {
    setState((prev) => {
      const next = { 
        ...prev, 
        positions: prev.positions.map((p) => 
          p.id === positionId ? { ...p, stopLoss: newSL, stopLossPct: Math.abs(newSL - p.entryPrice) / p.entryPrice } : p
        ) 
      };
      persistState(next);
      return next;
    });
  }, [persistState]);

  const adjustTakeProfit = useCallback((positionId: string, newTP: number) => {
    setState((prev) => {
      const next = { 
        ...prev, 
        positions: prev.positions.map((p) => 
          p.id === positionId ? { ...p, takeProfit: newTP, takeProfitPct: Math.abs(newTP - p.entryPrice) / p.entryPrice } : p
        ) 
      };
      persistState(next);
      return next;
    });
  }, [persistState]);

  const resetAccount = useCallback((preserveHistory = true) => {
    const next: PersistedState = {
      ...DEFAULT_STATE,
      settings: {
        ...DEFAULT_SETTINGS,
        lastResetAt: Date.now(),
      },
      ...(preserveHistory ? { history: fullHistory, signalStats: state.signalStats } : {}),
    };
    persistState(next);
  }, [persistState, fullHistory, state.signalStats]);

  const activateKillSwitch = useCallback((reason: string) => {
    const settings = { ...state.settings, killSwitchActive: true, killSwitchReason: reason, killSwitchActivatedAt: Date.now() };
    persistSettings(settings);
  }, [state.settings, persistSettings]);

  const deactivateKillSwitch = useCallback(() => {
    const settings = { ...state.settings, killSwitchActive: false, killSwitchReason: null, killSwitchActivatedAt: null };
    persistSettings(settings);
  }, [state.settings, persistSettings]);

  /* ── Auto signal follow ───────────────────────────────────────── */
  const followSignal = useCallback((params: {
    coin: PaperCoin;
    signal: "LONG" | "SHORT";
    leverage: LeverageValue;
    riskPct: number;
    timeframe?: Timeframe;
    signalQuality?: number;
    confidence?: number;
    probability?: number;
    marketRegime?: MarketRegime;
  }) => {
    const { coin, signal, leverage, riskPct, timeframe = "15m", signalQuality = 50, confidence = 50, probability = 50, marketRegime = "range_bound" } = params;
    
    if (signalFollowConfig.enabled) {
      if (!signalFollowConfig.allowedCoins.includes(coin)) return;
      if (!signalFollowConfig.allowedTimeframes.includes(timeframe)) return;
      if (signalFollowConfig.minSignalQuality > signalQuality) return;
      if (signalFollowConfig.minConfidence > confidence) return;
      if (signalFollowConfig.minProbability > probability) return;
      if (state.positions.length >= killSwitchConfig.maxConcurrentTrades) return;
      if (dailyTradeCountRef.current >= signalFollowConfig.maxDailyTrades) return;
      if (state.settings.killSwitchActive) return;
      if (signalFollowConfig.allowedDirection !== "BOTH" && signalFollowConfig.allowedDirection !== signal) return;
    }
    
    setState((prev) => {
      const price = prices[coin] ?? 0;
      if (price <= 0) return prev;
      
      const opposite = signal === "LONG" ? "SHORT" : "LONG";
      const toClose = prev.positions.find((p) => p.coin === coin && p.signalFollowed && p.direction === opposite);
      const existing = prev.positions.find((p) => p.coin === coin && p.direction === signal);
      if (existing) return prev;

      const riskAmount = Math.max(1, (riskPct / 100) * (prev.cashBalance + (toClose ? toClose.margin : 0)));
      const marginToUse = Math.min(riskAmount, prev.cashBalance + (toClose ? toClose.margin : 0));
      if (marginToUse < 0.5) return prev;

      let cashBalance = prev.cashBalance;
      let positions   = prev.positions;
      const signalStats = [...prev.signalStats];

      if (toClose) {
        const exitFee  = feeFor(price * toClose.quantity, "market");
        const rawPnl   = toClose.direction === "LONG" ? (price - toClose.entryPrice) * toClose.quantity : (toClose.entryPrice - price) * toClose.quantity;
        const pnl = rawPnl - toClose.entryFee - exitFee;
        cashBalance += toClose.margin + pnl;
        const closedAt = Date.now();
        const result: TradeResult = Math.abs(pnl) < 0.5 ? "breakeven" : pnl >= 0 ? "win" : "loss";
        const trade: PaperTrade = {
          id: toClose.id, coin: toClose.coin, direction: toClose.direction,
          entryPrice: toClose.entryPrice, exitPrice: price,
          quantity: toClose.quantity, notional: toClose.notional,
          leverage: toClose.leverage, margin: toClose.margin,
          pnl, pnlPct: calcPnlPct(pnl, toClose.margin),
          totalFees: toClose.entryFee + exitFee,
          duration: closedAt - toClose.openedAt, openedAt: toClose.openedAt, closedAt,
          result, exitReason: "manual", signalFollowed: true,
          timeframe: toClose.timeframe, mode: toClose.mode,
          signalQuality: toClose.signalQuality, confidence: toClose.confidence,
          probability: toClose.probability, marketRegime: toClose.marketRegime,
          stopLoss: toClose.stopLoss, takeProfit: toClose.takeProfit,
          stopLossHit: false, takeProfitHit: false,
        };
        
        const idx = signalStats.findIndex((s) => s.coin === toClose.coin);
        if (idx >= 0) { signalStats[idx] = { ...signalStats[idx], total: signalStats[idx].total + 1, wins: signalStats[idx].wins + (result === "win" ? 1 : 0), totalPnl: signalStats[idx].totalPnl + pnl }; }
        else { signalStats.push({ coin: toClose.coin, total: 1, wins: result === "win" ? 1 : 0, totalPnl: pnl, avgQuality: toClose.signalQuality }); }
        
        positions = positions.filter((p) => p.id !== toClose.id);
        persistHistory([trade, ...fullHistory].slice(0, 1000));
      }

      if (cashBalance < marginToUse) return { ...prev, cashBalance, positions, signalStats };

      const entryPrice = price;
      const notional   = marginToUse * leverage;
      const quantity   = notional / entryPrice;
      const entryFee   = feeFor(notional, "market");
      const liqPrice   = calcLiquidation(entryPrice, leverage, signal);
      const mode = getTradeMode(timeframe);
      const id = genId();
      const pos: PaperPosition = {
        id, coin, direction: signal, entryPrice, quantity, notional,
        margin: marginToUse, leverage, signalFollowed: true, orderType: "market",
        stopLoss: signal === "LONG" ? entryPrice * (1 - 0.015) : entryPrice * (1 + 0.015),
        takeProfit: signal === "LONG" ? entryPrice * (1 + 0.030) : entryPrice * (1 - 0.030),
        liquidationPrice: liqPrice, openedAt: Date.now(), entryFee,
        timeframe, mode,
        signalQuality, confidence, probability, marketRegime,
        stopLossPct: 0.015, takeProfitPct: 0.030,
      };

      const next: PersistedState = {
        ...prev,
        cashBalance: cashBalance - marginToUse,
        positions: [...positions, pos],
        signalStats,
      };
      persistState(next);
      dailyTradeCountRef.current++;
      return next;
    });
  }, [prices, persistState, persistHistory, fullHistory, state, signalFollowConfig, killSwitchConfig]);

  /* ── Equity Curve Tracking ─────────────────────────────────────── */
  useEffect(() => {
    if (!loaded) return;
    const equity = state.cashBalance + state.positions.reduce((s, p) => s + p.margin + calcUnrealizedPnl(p, prices[p.coin] ?? 0), 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dailyPnl = fullHistory.filter(t => t.closedAt >= today.getTime()).reduce((s, t) => s + t.pnl, 0);
    
    const snapshot: EquitySnapshot = {
      timestamp: Date.now(),
      balance: state.cashBalance,
      equity,
      openPositions: state.positions.length,
      dailyPnl,
    };
    
    setEquityHistory(prev => {
      const updated = [...prev, snapshot].slice(-500);
      persistEquity(updated);
      return updated;
    });
  }, [loaded, state.cashBalance, state.positions.length, fullHistory]);

  /* ── Derived: analytics ──────────────────────────────────────── */
  const analytics = useMemo(() => {
    const unrealizedPnl = state.positions.reduce((s, p) => {
      const price = prices[p.coin] ?? 0;
      return s + (price > 0 ? calcUnrealizedPnl(p, price) : 0);
    }, 0);
    const usedMargin = state.positions.reduce((s, p) => s + p.margin, 0);
    const totalBalance = state.cashBalance + usedMargin + unrealizedPnl;
    const totalPnl = totalBalance - STARTING_BALANCE;
    const totalPnlPct = (totalPnl / STARTING_BALANCE) * 100;

    const closed = fullHistory;
    const wins = closed.filter((t) => t.result === "win").length;
    const losses = closed.filter((t) => t.result === "loss").length;
    const breakeven = closed.filter((t) => t.result === "breakeven").length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

    const totalWin = closed.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(closed.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 999 : 0;
    const avgWin = wins > 0 ? totalWin / wins : 0;
    const avgLoss = losses > 0 ? totalLoss / losses : 0;
    const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;

    const bestTrade = closed.reduce<PaperTrade | null>((b, t) => (!b || t.pnl > b.pnl ? t : b), null);
    const worstTrade = closed.reduce<PaperTrade | null>((b, t) => (!b || t.pnl < b.pnl ? t : b), null);

    let curStreak = 0, longestWin = 0, longestLoss = 0, cur = 0;
    for (const t of closed) {
      const w = t.result === "win";
      if (w) { cur = cur >= 0 ? cur + 1 : 1; longestWin = Math.max(longestWin, cur); }
      else   { cur = cur <= 0 ? cur - 1 : -1; longestLoss = Math.max(longestLoss, -cur); }
    }
    curStreak = cur;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dailyPnl = closed.filter((t) => t.closedAt >= today.getTime()).reduce((s, t) => s + t.pnl, 0) + unrealizedPnl;

    const coinAccuracy = state.signalStats.map((s) => ({
      coin: s.coin,
      total: s.total,
      wins: s.wins,
      accuracy: s.total > 0 ? (s.wins / s.total) * 100 : 0,
      avgPnl: s.total > 0 ? s.totalPnl / s.total : 0,
      avgQuality: s.avgQuality,
    }));

    const coinPnl: Record<string, number> = {};
    for (const t of closed) { coinPnl[t.coin] = (coinPnl[t.coin] ?? 0) + t.pnl; }
    const bestCoinEntry = Object.entries(coinPnl).sort((a, b) => b[1] - a[1])[0];
    const mostProfitableCoin = bestCoinEntry ? COIN_LABEL[bestCoinEntry[0] as PaperCoin] ?? bestCoinEntry[0] : "—";
    
    const mostAccurateCoin = coinAccuracy.filter((c) => c.total >= 2).sort((a, b) => b.accuracy - a.accuracy)[0]?.coin;

    const timeframeStats: Record<Timeframe, { total: number; wins: number; pnl: number }> = {} as any;
    for (const tf of TIMEFRAMES) {
      const tfTrades = closed.filter(t => t.timeframe === tf);
      timeframeStats[tf] = {
        total: tfTrades.length,
        wins: tfTrades.filter(t => t.result === "win").length,
        pnl: tfTrades.reduce((s, t) => s + t.pnl, 0),
      };
    }

    return {
      unrealizedPnl, usedMargin, totalBalance, cashBalance: state.cashBalance,
      totalPnl, totalPnlPct, dailyPnl,
      totalTrades: closed.length, wins, losses, breakeven, winRate,
      profitFactor, avgWin, avgLoss, avgRR,
      bestTrade, worstTrade,
      curStreak, longestWin, longestLoss,
      coinAccuracy, mostProfitableCoin,
      mostAccurateCoin: mostAccurateCoin ? COIN_LABEL[mostAccurateCoin] : "—",
      modeStats: state.modeStats,
      regimeStats: state.regimeStats,
      timeframeStats,
      equityHistory,
      fullHistory,
      settings: state.settings,
      killSwitchConfig,
      signalFollowConfig,
    };
  }, [state, prices, equityHistory, fullHistory]);

  /* ── Market Regime Detection ─────────────────────────────────── */
  const detectMarketRegime = useCallback((
    priceChange: number,
    quoteVolume: number,
    fundingRate: number,
  ): { regime: MarketRegime; confidence: number; explanation: string } => {
    const absChange = Math.abs(priceChange);
    const volumeLevel = quoteVolume > 1000000000 ? "high" : quoteVolume > 500000000 ? "medium" : "low";
    
    let regime: MarketRegime;
    let confidence = 60;
    let explanation = "";

    if (absChange > 5) {
      regime = priceChange > 0 ? "strong_bull" : "strong_bear";
      explanation = priceChange > 0 
        ? `Strong upward momentum with ${absChange.toFixed(1)}% price increase. Consider LONG setups.`
        : `Strong downward momentum with ${absChange.toFixed(1)}% price decline. Consider SHORT setups.`;
      confidence = 85;
    } else if (absChange > 2) {
      regime = priceChange > 0 ? "weak_bull" : "weak_bear";
      explanation = priceChange > 0
        ? `Moderate bullish pressure with ${absChange.toFixed(1)}% gain. Watch for trend continuation.`
        : `Moderate bearish pressure with ${absChange.toFixed(1)}% decline. Monitor for reversals.`;
      confidence = 70;
    } else if (volumeLevel === "high" && absChange < 1) {
      regime = "high_volatility";
      explanation = "High volume but low price movement suggests accumulation/distribution phase.";
      confidence = 75;
    } else if (volumeLevel === "low" && absChange < 0.5) {
      regime = "low_volatility";
      explanation = "Low volume and minimal price action. Wait for confirmation before entering.";
      confidence = 70;
    } else if (Math.abs(fundingRate) > 0.01) {
      regime = fundingRate > 0 ? "breakout" : "reversal";
      explanation = fundingRate > 0
        ? "Positive funding indicates bullish sentiment. Watch for breakout opportunities."
        : "Negative funding suggests bearish bias. Consider reversal setups.";
      confidence = 65;
    } else {
      regime = "range_bound";
      explanation = "Price consolidating in a range. Trade from boundaries or wait for breakout.";
      confidence = 60;
    }

    return { regime, confidence, explanation };
  }, []);

  return {
    loaded,
    positions: state.positions,
    history: fullHistory,
    fullHistory,
    cashBalance: state.cashBalance,
    analytics,
    openTrade,
    closeTrade,
    moveStopLoss,
    adjustTakeProfit,
    resetAccount,
    followSignal,
    prevSignalRef,
    killSwitchConfig,
    setKillSwitchConfig: persistKillSwitchConfig,
    signalFollowConfig,
    setSignalFollowConfig: persistSignalFollowConfig,
    activateKillSwitch,
    deactivateKillSwitch,
    checkKillSwitch,
    detectMarketRegime,
    equityHistory,
  };
}