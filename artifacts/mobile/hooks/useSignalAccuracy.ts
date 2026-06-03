/**
 * Signal Accuracy Database
 * Persistent AsyncStorage-backed signal tracking with 7/30/90/all-time windows.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "signal_accuracy_v1";
const MAX_RECORDS = 500;

/* ── Types ──────────────────────────────────────────────────────────── */

export type SignalResult = "open" | "win" | "loss" | "expired";
export type SignalDirection = "LONG" | "SHORT";
export type SignalSetupType = "Trend Follow" | "S/R Bounce" | "S/D Zone" | "Breakout" | "Reversal" | "Unknown";

export interface SignalRecord {
  id: string;
  coin: string;
  signal: SignalDirection;
  timeframe: string;
  qualityScore: number;
  qualityCategory: string;
  probability: number;
  confirmedFactors: number;
  totalFactors: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  generatedAt: number;
  result: SignalResult;
  closedAt?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPct?: number;
  setupType: SignalSetupType;
}

export interface PeriodStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgQuality: number;
}

export interface AccuracyStats {
  total: number;
  open: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number;
  avgQuality: number;
  avgProbability: number;

  last7Days: PeriodStats;
  last30Days: PeriodStats;
  last90Days: PeriodStats;

  byCoin: Record<string, PeriodStats>;
  byTimeframe: Record<string, PeriodStats>;
  bySignalType: Record<string, PeriodStats>;
  bySetupType: Record<string, PeriodStats>;

  bestCoin: string;
  worstCoin: string;
  bestTimeframe: string;
  worstTimeframe: string;
  highestWinQuality: number;
  avgQualityWin: number;
  avgQualityLoss: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

function periodStats(records: SignalRecord[]): PeriodStats {
  const closed = records.filter((r) => r.result === "win" || r.result === "loss");
  const wins   = closed.filter((r) => r.result === "win").length;
  const losses = closed.filter((r) => r.result === "loss").length;
  const total  = closed.length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const avgQuality = total > 0
    ? Math.round(records.reduce((s, r) => s + r.qualityScore, 0) / records.length)
    : 0;
  return { total, wins, losses, winRate, avgQuality };
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function bestGroupBy(groups: Record<string, PeriodStats>, minTotal = 2): string {
  const candidates = Object.entries(groups).filter(([, s]) => s.total >= minTotal);
  if (!candidates.length) return "—";
  return candidates.sort((a, b) => b[1].winRate - a[1].winRate)[0][0];
}

function worstGroupBy(groups: Record<string, PeriodStats>, minTotal = 2): string {
  const candidates = Object.entries(groups).filter(([, s]) => s.total >= minTotal);
  if (!candidates.length) return "—";
  return candidates.sort((a, b) => a[1].winRate - b[1].winRate)[0][0];
}

function computeStats(records: SignalRecord[]): AccuracyStats {
  const now = Date.now();
  const closed   = records.filter((r) => r.result === "win" || r.result === "loss");
  const open     = records.filter((r) => r.result === "open").length;
  const wins     = closed.filter((r) => r.result === "win").length;
  const losses   = closed.filter((r) => r.result === "loss").length;
  const expired  = records.filter((r) => r.result === "expired").length;
  const total    = closed.length;
  const winRate  = total > 0 ? Math.round((wins / total) * 100) : 0;
  const avgQuality    = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.qualityScore, 0) / records.length) : 0;
  const avgProbability = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.probability, 0) / records.length) : 0;

  const after = (days: number) => records.filter((r) => r.generatedAt >= now - days * DAY_MS);

  const byCoinGroups      = groupBy(records, (r) => r.coin);
  const byTFGroups        = groupBy(records, (r) => r.timeframe);
  const byTypeGroups      = groupBy(records, (r) => r.signal);
  const bySetupGroups     = groupBy(records, (r) => r.setupType);

  const byCoin      = Object.fromEntries(Object.entries(byCoinGroups).map(([k, v]) => [k, periodStats(v)]));
  const byTimeframe = Object.fromEntries(Object.entries(byTFGroups).map(([k, v]) => [k, periodStats(v)]));
  const bySignalType = Object.fromEntries(Object.entries(byTypeGroups).map(([k, v]) => [k, periodStats(v)]));
  const bySetupType = Object.fromEntries(Object.entries(bySetupGroups).map(([k, v]) => [k, periodStats(v)]));

  const winRecords  = closed.filter((r) => r.result === "win");
  const lossRecords = closed.filter((r) => r.result === "loss");
  const avgQualityWin  = winRecords.length > 0  ? Math.round(winRecords.reduce((s, r) => s + r.qualityScore, 0) / winRecords.length)  : 0;
  const avgQualityLoss = lossRecords.length > 0 ? Math.round(lossRecords.reduce((s, r) => s + r.qualityScore, 0) / lossRecords.length) : 0;
  const highestWinQuality = winRecords.length > 0 ? Math.max(...winRecords.map((r) => r.qualityScore)) : 0;

  return {
    total, open, wins, losses, expired, winRate, avgQuality, avgProbability,
    last7Days: periodStats(after(7)),
    last30Days: periodStats(after(30)),
    last90Days: periodStats(after(90)),
    byCoin, byTimeframe, bySignalType, bySetupType,
    bestCoin: bestGroupBy(byCoin),
    worstCoin: worstGroupBy(byCoin),
    bestTimeframe: bestGroupBy(byTimeframe),
    worstTimeframe: worstGroupBy(byTimeframe),
    highestWinQuality, avgQualityWin, avgQualityLoss,
  };
}

/* ── Detect setup type ──────────────────────────────────────────────── */

function inferSetupType(qualityScore: number, timeframe: string): SignalSetupType {
  if (timeframe === "1h" || timeframe === "4h") return "Trend Follow";
  if (qualityScore >= 70) return "S/D Zone";
  if (qualityScore >= 55) return "S/R Bounce";
  return "Unknown";
}

/* ── Hook ────────────────────────────────────────────────────────────── */

export function useSignalAccuracy() {
  const [records, setRecords] = useState<SignalRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  /* Load */
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setRecords(JSON.parse(raw) as SignalRecord[]); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: SignalRecord[]) => {
    setRecords(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /* Add a new signal record (call when signal fires) */
  const addSignalRecord = useCallback((params: {
    coin: string;
    signal: SignalDirection;
    timeframe: string;
    qualityScore: number;
    qualityCategory: string;
    probability: number;
    confirmedFactors: number;
    totalFactors: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
  }): string => {
    const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record: SignalRecord = {
      id, ...params,
      stopLoss: params.stopLoss ?? 0,
      takeProfit: params.takeProfit ?? 0,
      generatedAt: Date.now(),
      result: "open",
      setupType: inferSetupType(params.qualityScore, params.timeframe),
    };
    setRecords((prev) => {
      const next = [record, ...prev].slice(0, MAX_RECORDS);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return id;
  }, []);

  /* Close a signal record with result */
  const closeSignalRecord = useCallback((
    id: string,
    result: "win" | "loss" | "expired",
    exitPrice?: number,
  ) => {
    setRecords((prev) => {
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        const pnl = exitPrice && r.entryPrice
          ? (r.signal === "LONG"
              ? (exitPrice - r.entryPrice) / r.entryPrice
              : (r.entryPrice - exitPrice) / r.entryPrice) * 100
          : undefined;
        return { ...r, result, closedAt: Date.now(), exitPrice, pnl, pnlPct: pnl };
      });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /* Auto-expire records that have been open > 4h */
  useEffect(() => {
    if (!loaded) return;
    const fourHours = 4 * 3_600_000;
    const now = Date.now();
    setRecords((prev) => {
      const updated = prev.map((r) =>
        r.result === "open" && now - r.generatedAt > fourHours
          ? { ...r, result: "expired" as SignalResult }
          : r
      );
      const changed = updated.some((r, i) => r.result !== prev[i].result);
      if (changed) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return changed ? updated : prev;
    });
  }, [loaded]);

  /* Expire open records when they flip to WAIT */
  const expireOpenRecords = useCallback((coin: string) => {
    setRecords((prev) => {
      const updated = prev.map((r) =>
        r.coin === coin && r.result === "open"
          ? { ...r, result: "expired" as SignalResult, closedAt: Date.now() }
          : r
      );
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => persist([]), [persist]);

  const stats = useMemo(() => computeStats(records), [records]);

  return {
    loaded,
    records,
    stats,
    addSignalRecord,
    closeSignalRecord,
    expireOpenRecords,
    clearAll,
  };
}
