import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Constants ──────────────────────────────────────────────────── */

const STORAGE_KEY      = "paper_trading_v2";
export const STARTING_BALANCE   = 100;
export const TAKER_FEE  = 0.0005;  // 0.05% market
export const MAKER_FEE  = 0.0002;  // 0.02% limit
const MAINT_MARGIN      = 0.004;   // 0.4% maintenance margin

/* ── Types ─────────────────────────────────────────────────────── */

export type PaperDirection = "LONG" | "SHORT";
export type ExitReason     = "manual" | "sl" | "tp" | "liquidation";
export type OrderType      = "market" | "limit";
export const LEVERAGES     = [1, 2, 3, 5, 10, 20, 50, 75, 100, 125] as const;
export type LeverageValue  = typeof LEVERAGES[number];

export const PAPER_COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"] as const;
export type PaperCoin = typeof PAPER_COINS[number];

export const COIN_LABEL: Record<PaperCoin, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", XRPUSDT: "XRP",
};

export interface PaperPosition {
  id: string;
  coin: PaperCoin;
  direction: PaperDirection;
  entryPrice: number;
  quantity: number;    // base asset
  notional: number;    // entryPrice * quantity
  margin: number;      // collateral used
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  liquidationPrice: number;
  openedAt: number;
  entryFee: number;
  signalFollowed: boolean;
  orderType: OrderType;
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
  duration: number;    // ms
  openedAt: number;
  closedAt: number;
  result: "win" | "loss";
  exitReason: ExitReason;
  signalFollowed: boolean;
}

export interface SignalStat {
  coin: PaperCoin;
  total: number;
  wins: number;
}

interface PersistedState {
  cashBalance: number;
  positions: PaperPosition[];
  history: PaperTrade[];
  signalStats: SignalStat[];
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

/* ── Default state ──────────────────────────────────────────────── */

const DEFAULT_STATE: PersistedState = {
  cashBalance: STARTING_BALANCE,
  positions: [],
  history: [],
  signalStats: [],
};

/* ── Hook ───────────────────────────────────────────────────────── */

export function usePaperTrading(prices: Record<PaperCoin, number>) {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const prevSignalRef = useRef<string>("WAIT");

  /* ── Persistence ─────────────────────────────────────────────── */
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PersistedState;
          setState(parsed);
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: PersistedState) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
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

          cashBalance += pos.margin + pnl;

          const trade: PaperTrade = {
            id: pos.id, coin: pos.coin, direction: pos.direction,
            entryPrice: pos.entryPrice, exitPrice, quantity: pos.quantity,
            notional: pos.notional, leverage: pos.leverage, margin: pos.margin,
            pnl, pnlPct, totalFees, duration: closedAt - pos.openedAt,
            openedAt: pos.openedAt, closedAt, result: pnl >= 0 ? "win" : "loss",
            exitReason: reason, signalFollowed: pos.signalFollowed,
          };
          newTrades.push(trade);

          if (pos.signalFollowed) {
            const idx = newSignalStats.findIndex((s) => s.coin === pos.coin);
            if (idx >= 0) {
              newSignalStats[idx] = { ...newSignalStats[idx], total: newSignalStats[idx].total + 1, wins: newSignalStats[idx].wins + (pnl >= 0 ? 1 : 0) };
            } else {
              newSignalStats.push({ coin: pos.coin, total: 1, wins: pnl >= 0 ? 1 : 0 });
            }
          }
        } else {
          remaining.push(pos);
        }
      }

      if (!changed) return prev;
      const next: PersistedState = {
        cashBalance: Math.max(0, cashBalance),
        positions: remaining,
        history: [...newTrades, ...prev.history].slice(0, 200),
        signalStats: newSignalStats,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [prices, loaded]);

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
  }): string | null => {
    const {
      coin, direction, marginUSDT, leverage,
      orderType = "market", limitPrice, stopLoss = null, takeProfit = null,
      signalFollowed = false,
    } = params;

    const entryPrice = orderType === "limit" && (limitPrice ?? 0) > 0
      ? limitPrice!
      : prices[coin] ?? 0;

    if (entryPrice <= 0 || marginUSDT <= 0) return null;

    let result: string | null = null;
    setState((prev) => {
      if (prev.cashBalance < marginUSDT) return prev;
      const notional     = marginUSDT * leverage;
      const quantity     = notional / entryPrice;
      const entryFee     = feeFor(notional, orderType);
      const liqPrice     = calcLiquidation(entryPrice, leverage, direction);
      const id           = `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      result = id;

      const pos: PaperPosition = {
        id, coin, direction, entryPrice, quantity, notional,
        margin: marginUSDT, leverage, stopLoss, takeProfit,
        liquidationPrice: liqPrice, openedAt: Date.now(),
        entryFee, signalFollowed, orderType,
      };
      const next = {
        ...prev,
        cashBalance: prev.cashBalance - marginUSDT,
        positions: [...prev.positions, pos],
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return result;
  }, [prices]);

  const closeTrade = useCallback((positionId: string, reason: ExitReason = "manual") => {
    setState((prev) => {
      const pos = prev.positions.find((p) => p.id === positionId);
      if (!pos) return prev;
      const price    = prices[pos.coin] ?? pos.entryPrice;
      const exitFee  = feeFor(price * pos.quantity, "market");
      const isLong   = pos.direction === "LONG";
      const rawPnl   = isLong ? (price - pos.entryPrice) * pos.quantity : (pos.entryPrice - price) * pos.quantity;
      const totalFees = pos.entryFee + exitFee;
      const pnl      = rawPnl - totalFees;
      const pnlPct   = calcPnlPct(pnl, pos.margin);
      const closedAt = Date.now();

      const trade: PaperTrade = {
        id: pos.id, coin: pos.coin, direction: pos.direction,
        entryPrice: pos.entryPrice, exitPrice: price, quantity: pos.quantity,
        notional: pos.notional, leverage: pos.leverage, margin: pos.margin,
        pnl, pnlPct, totalFees, duration: closedAt - pos.openedAt,
        openedAt: pos.openedAt, closedAt, result: pnl >= 0 ? "win" : "loss",
        exitReason: reason, signalFollowed: pos.signalFollowed,
      };

      const newSignalStats = [...prev.signalStats];
      if (pos.signalFollowed) {
        const idx = newSignalStats.findIndex((s) => s.coin === pos.coin);
        if (idx >= 0) {
          newSignalStats[idx] = { ...newSignalStats[idx], total: newSignalStats[idx].total + 1, wins: newSignalStats[idx].wins + (pnl >= 0 ? 1 : 0) };
        } else {
          newSignalStats.push({ coin: pos.coin, total: 1, wins: pnl >= 0 ? 1 : 0 });
        }
      }

      const next: PersistedState = {
        cashBalance: Math.max(0, prev.cashBalance + pos.margin + pnl),
        positions: prev.positions.filter((p) => p.id !== positionId),
        history: [trade, ...prev.history].slice(0, 200),
        signalStats: newSignalStats,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [prices]);

  const moveStopLoss = useCallback((positionId: string, newSL: number) => {
    setState((prev) => {
      const next = { ...prev, positions: prev.positions.map((p) => p.id === positionId ? { ...p, stopLoss: newSL } : p) };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const adjustTakeProfit = useCallback((positionId: string, newTP: number) => {
    setState((prev) => {
      const next = { ...prev, positions: prev.positions.map((p) => p.id === positionId ? { ...p, takeProfit: newTP } : p) };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetAccount = useCallback(() => {
    persist(DEFAULT_STATE);
  }, [persist]);

  /* ── Auto signal follow ───────────────────────────────────────── */
  const followSignal = useCallback((params: {
    coin: PaperCoin;
    signal: "LONG" | "SHORT";
    leverage: LeverageValue;
    riskPct: number;
  }) => {
    const { coin, signal, leverage, riskPct } = params;
    setState((prev) => {
      const price = prices[coin] ?? 0;
      if (price <= 0) return prev;
      const opposite = signal === "LONG" ? "SHORT" : "LONG";
      /* Close any existing opposite signal-followed position */
      const toClose = prev.positions.find((p) => p.coin === coin && p.signalFollowed && p.direction === opposite);
      /* Don't open if already have a position in same direction */
      const existing = prev.positions.find((p) => p.coin === coin && p.direction === signal);
      if (existing) return prev;

      const riskAmount = Math.max(1, (riskPct / 100) * (prev.cashBalance + (toClose ? toClose.margin : 0)));
      const marginToUse = Math.min(riskAmount, prev.cashBalance + (toClose ? toClose.margin : 0));
      if (marginToUse < 0.5) return prev;

      let cashBalance = prev.cashBalance;
      let positions   = prev.positions;
      let history     = prev.history;
      const signalStats = [...prev.signalStats];

      /* Close opposite first */
      if (toClose) {
        const exitFee  = feeFor(price * toClose.quantity, "market");
        const rawPnl   = toClose.direction === "LONG"
          ? (price - toClose.entryPrice) * toClose.quantity
          : (toClose.entryPrice - price) * toClose.quantity;
        const pnl = rawPnl - toClose.entryFee - exitFee;
        cashBalance += toClose.margin + pnl;
        const closedAt = Date.now();
        const trade: PaperTrade = {
          id: toClose.id, coin: toClose.coin, direction: toClose.direction,
          entryPrice: toClose.entryPrice, exitPrice: price,
          quantity: toClose.quantity, notional: toClose.notional,
          leverage: toClose.leverage, margin: toClose.margin,
          pnl, pnlPct: calcPnlPct(pnl, toClose.margin),
          totalFees: toClose.entryFee + exitFee,
          duration: closedAt - toClose.openedAt, openedAt: toClose.openedAt, closedAt,
          result: pnl >= 0 ? "win" : "loss", exitReason: "manual", signalFollowed: true,
        };
        const idx = signalStats.findIndex((s) => s.coin === toClose.coin);
        if (idx >= 0) { signalStats[idx] = { ...signalStats[idx], total: signalStats[idx].total + 1, wins: signalStats[idx].wins + (pnl >= 0 ? 1 : 0) }; }
        else { signalStats.push({ coin: toClose.coin, total: 1, wins: pnl >= 0 ? 1 : 0 }); }
        history = [trade, ...history].slice(0, 200);
        positions = positions.filter((p) => p.id !== toClose.id);
      }

      if (cashBalance < marginToUse) return { ...prev, cashBalance, positions, history, signalStats };

      const entryPrice = price;
      const notional   = marginToUse * leverage;
      const quantity   = notional / entryPrice;
      const entryFee   = feeFor(notional, "market");
      const liqPrice   = calcLiquidation(entryPrice, leverage, signal);
      const slPct      = 0.015; // 1.5%
      const tpPct      = 0.030; // 3.0%
      const id = `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const pos: PaperPosition = {
        id, coin, direction: signal, entryPrice, quantity, notional,
        margin: marginToUse, leverage, signalFollowed: true, orderType: "market",
        stopLoss:   signal === "LONG" ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct),
        takeProfit: signal === "LONG" ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct),
        liquidationPrice: liqPrice, openedAt: Date.now(), entryFee,
      };

      const next: PersistedState = {
        cashBalance: cashBalance - marginToUse,
        positions: [...positions, pos],
        history, signalStats,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [prices]);

  /* ── Derived: analytics ──────────────────────────────────────── */
  const analytics = useMemo(() => {
    const unrealizedPnl = state.positions.reduce((s, p) => {
      const price = prices[p.coin] ?? 0;
      return s + (price > 0 ? calcUnrealizedPnl(p, price) : 0);
    }, 0);
    const usedMargin     = state.positions.reduce((s, p) => s + p.margin, 0);
    const totalBalance   = state.cashBalance + usedMargin + unrealizedPnl;
    const totalPnl       = totalBalance - STARTING_BALANCE;
    const totalPnlPct    = (totalPnl / STARTING_BALANCE) * 100;

    const closed  = state.history;
    const wins    = closed.filter((t) => t.result === "win").length;
    const losses  = closed.filter((t) => t.result === "loss").length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

    const totalWin  = closed.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(closed.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 999 : 0;
    const avgWin   = wins > 0 ? totalWin / wins : 0;
    const avgLoss  = losses > 0 ? totalLoss / losses : 0;
    const avgRR    = avgLoss > 0 ? avgWin / avgLoss : 0;

    const bestTrade  = closed.reduce<PaperTrade | null>((b, t) => (!b || t.pnl > b.pnl ? t : b), null);
    const worstTrade = closed.reduce<PaperTrade | null>((b, t) => (!b || t.pnl < b.pnl ? t : b), null);

    /* Streaks */
    let curStreak = 0, longestWin = 0, longestLoss = 0, cur = 0;
    for (const t of closed) {
      const w = t.result === "win";
      if (w) { cur = cur >= 0 ? cur + 1 : 1; longestWin = Math.max(longestWin, cur); }
      else   { cur = cur <= 0 ? cur - 1 : -1; longestLoss = Math.max(longestLoss, -cur); }
    }
    curStreak = cur;

    /* Today's PnL */
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const dailyPnl = closed.filter((t) => t.closedAt >= today.getTime()).reduce((s, t) => s + t.pnl, 0) + unrealizedPnl;

    /* Per-coin signal accuracy */
    const coinAccuracy = state.signalStats.map((s) => ({
      coin: s.coin,
      total: s.total,
      wins: s.wins,
      accuracy: s.total > 0 ? (s.wins / s.total) * 100 : 0,
    }));

    const mostProfitableCoin = (() => {
      const coinPnl: Record<string, number> = {};
      for (const t of closed) { coinPnl[t.coin] = (coinPnl[t.coin] ?? 0) + t.pnl; }
      const best = Object.entries(coinPnl).sort((a, b) => b[1] - a[1])[0];
      return best ? COIN_LABEL[best[0] as PaperCoin] ?? best[0] : "—";
    })();

    const mostAccurateCoin = coinAccuracy.filter((c) => c.total >= 2).sort((a, b) => b.accuracy - a.accuracy)[0]?.coin;

    return {
      unrealizedPnl, usedMargin, totalBalance, cashBalance: state.cashBalance,
      totalPnl, totalPnlPct, dailyPnl,
      totalTrades: closed.length, wins, losses, winRate,
      profitFactor, avgWin, avgLoss, avgRR,
      bestTrade, worstTrade,
      curStreak, longestWin, longestLoss,
      coinAccuracy, mostProfitableCoin,
      mostAccurateCoin: mostAccurateCoin ? COIN_LABEL[mostAccurateCoin] : "—",
    };
  }, [state, prices]);

  return {
    loaded,
    positions: state.positions,
    history: state.history,
    cashBalance: state.cashBalance,
    analytics,
    openTrade,
    closeTrade,
    moveStopLoss,
    adjustTakeProfit,
    resetAccount,
    followSignal,
    prevSignalRef,
  };
}
