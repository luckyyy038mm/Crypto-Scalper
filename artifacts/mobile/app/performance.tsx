import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import type { TradeEntry } from "./journal";

const STORAGE_KEY = "btc_trade_journal_v1";

type TimeFilter = "Today" | "7D" | "30D" | "90D" | "All";
const TIME_FILTERS: TimeFilter[] = ["Today", "7D", "30D", "90D", "All"];

function filterByTime(trades: TradeEntry[], filter: TimeFilter): TradeEntry[] {
  if (filter === "All") return trades;
  const now = Date.now();
  const ms = filter === "Today" ? 86_400_000 : filter === "7D" ? 7 * 86_400_000 : filter === "30D" ? 30 * 86_400_000 : 90 * 86_400_000;
  return trades.filter((t) => {
    try {
      const d = new Date(`${t.date} ${t.time}`).getTime();
      return now - d <= ms;
    } catch { return true; }
  });
}

function StatCard({ label, value, sub, color, icon, colors }: {
  label: string; value: string | number; sub?: string; color?: string; icon: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[sc.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={sc.top}>
        <Feather name={icon as any} size={13} color={color ?? colors.mutedForeground} />
        <Text style={[sc.label, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[sc.value, { color: color ?? colors.foreground }]}>{value}</Text>
      {sub ? <Text style={[sc.sub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  root: { flex: 1, minWidth: "46%", borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  top: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", flex: 1 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular" },
});

/* ── Mini bar chart ─────────────────────────────────────────────── */
function BarChart({ data, colors, label }: {
  data: { label: string; value: number; color?: string }[];
  colors: ReturnType<typeof useColors>;
  label: string;
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <View style={[chart.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[chart.title, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={chart.bars}>
        {data.map((d) => {
          const pct = Math.abs(d.value) / max;
          const barColor = d.color ?? (d.value >= 0 ? colors.up : colors.down);
          return (
            <View key={d.label} style={chart.barGroup}>
              <Text style={[chart.barVal, { color: barColor }]}>
                {d.value > 0 ? "+" : ""}{typeof d.value === "number" && !Number.isInteger(d.value) ? d.value.toFixed(1) : d.value}{d.label.includes("%") ? "" : ""}
              </Text>
              <View style={[chart.barTrack, { backgroundColor: colors.border }]}>
                <View style={[chart.barFill, { height: `${pct * 100}%` as any, backgroundColor: barColor }]} />
              </View>
              <Text style={[chart.barLabel, { color: colors.mutedForeground }]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const chart = StyleSheet.create({
  root: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  title: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 },
  barGroup: { flex: 1, alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" },
  barVal: { fontSize: 8, fontFamily: "Inter_700Bold" },
  barTrack: { flex: 1, width: "100%", borderRadius: 3, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 3, minHeight: 3 },
  barLabel: { fontSize: 8, fontFamily: "Inter_500Medium", textAlign: "center" },
});

/* ── Streak indicator ───────────────────────────────────────────── */
function StreakCard({ current, longestWin, longestLoss, colors }: {
  current: number; longestWin: number; longestLoss: number;
  colors: ReturnType<typeof useColors>;
}) {
  const isPositive = current >= 0;
  const streakColor = current === 0 ? colors.mutedForeground : isPositive ? colors.up : colors.down;
  const streakLabel = current === 0 ? "No streak" : isPositive ? `${current}W streak` : `${Math.abs(current)}L streak`;

  return (
    <View style={[strk.root, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[strk.title, { color: colors.mutedForeground }]}>STREAKS</Text>
      <View style={strk.row}>
        <View style={strk.col}>
          <Text style={[strk.big, { color: streakColor }]}>{streakLabel}</Text>
          <Text style={[strk.sub, { color: colors.mutedForeground }]}>Current</Text>
        </View>
        <View style={[strk.divider, { backgroundColor: colors.border }]} />
        <View style={strk.col}>
          <Text style={[strk.stat, { color: colors.up }]}>{longestWin}W</Text>
          <Text style={[strk.sub, { color: colors.mutedForeground }]}>Best Win Run</Text>
        </View>
        <View style={[strk.divider, { backgroundColor: colors.border }]} />
        <View style={strk.col}>
          <Text style={[strk.stat, { color: colors.down }]}>{longestLoss}L</Text>
          <Text style={[strk.sub, { color: colors.mutedForeground }]}>Worst Loss Run</Text>
        </View>
      </View>
    </View>
  );
}
const strk = StyleSheet.create({
  root: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  title: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  row: { flexDirection: "row", alignItems: "center" },
  col: { flex: 1, alignItems: "center", gap: 2 },
  divider: { width: 1, height: 40 },
  big: { fontSize: 14, fontFamily: "Inter_700Bold" },
  stat: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
});

/* ── Screen ─────────────────────────────────────────────────────── */

export default function PerformanceScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { history } = useTradingData();
  const topPad  = Platform.OS === "web" ? 60 : insets.top;

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30D");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setTrades(JSON.parse(raw) as TradeEntry[]);
    });
  }, []);

  const filtered = useMemo(() => filterByTime(trades, timeFilter), [trades, timeFilter]);
  const closed   = useMemo(() => filtered.filter((t) => t.status === "Closed" && t.pnlPct !== null), [filtered]);
  const wins     = useMemo(() => closed.filter((t) => (t.pnlPct ?? 0) > 0), [closed]);
  const losses   = useMemo(() => closed.filter((t) => (t.pnlPct ?? 0) <= 0), [closed]);

  const winRate  = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWin   = wins.length > 0 ? wins.reduce((a, t) => a + (t.pnlPct ?? 0), 0) / wins.length : 0;
  const avgLoss  = losses.length > 0 ? Math.abs(losses.reduce((a, t) => a + (t.pnlPct ?? 0), 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin / avgLoss) : (avgWin > 0 ? Infinity : 0);

  const avgRR = useMemo(() => {
    const withRR = filtered.filter((t) => t.riskReward !== null && t.riskReward !== undefined);
    return withRR.length > 0 ? withRR.reduce((a, t) => a + (t.riskReward ?? 0), 0) / withRR.length : 0;
  }, [filtered]);

  const totalPnl = closed.reduce((a, t) => a + (t.pnlPct ?? 0), 0);

  /* ── Streak calc ──────────────────────────────────────────────── */
  const { current: currentStreak, longestWin, longestLoss } = useMemo(() => {
    let current = 0, longestWin = 0, longestLoss = 0, tempWin = 0, tempLoss = 0;
    for (const t of [...closed].reverse()) {
      const won = (t.pnlPct ?? 0) > 0;
      if (won) { tempWin++; tempLoss = 0; } else { tempLoss++; tempWin = 0; }
      longestWin  = Math.max(longestWin, tempWin);
      longestLoss = Math.max(longestLoss, tempLoss);
    }
    if (closed.length > 0) {
      const last = closed[closed.length - 1];
      for (let i = closed.length - 1; i >= 0; i--) {
        const won = (closed[i].pnlPct ?? 0) > 0;
        const lastWon = (last.pnlPct ?? 0) > 0;
        if (won !== lastWon) break;
        current += lastWon ? 1 : -1;
      }
    }
    return { current, longestWin, longestLoss };
  }, [closed]);

  /* ── Signal history stats ─────────────────────────────────────── */
  const totalSignals = history.length;
  const longSigs  = history.filter((h) => h.signal === "LONG").length;
  const shortSigs = history.filter((h) => h.signal === "SHORT").length;
  const waitSigs  = history.filter((h) => h.signal === "WAIT").length;

  /* ── Direction performance ────────────────────────────────────── */
  const longTrades  = closed.filter((t) => t.direction === "LONG");
  const shortTrades = closed.filter((t) => t.direction === "SHORT");
  const longWR   = longTrades.length > 0 ? Math.round((longTrades.filter((t) => (t.pnlPct ?? 0) > 0).length / longTrades.length) * 100) : 0;
  const shortWR  = shortTrades.length > 0 ? Math.round((shortTrades.filter((t) => (t.pnlPct ?? 0) > 0).length / shortTrades.length) * 100) : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>Performance</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{closed.length} closed trades</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>

        {/* Time filter */}
        <View style={styles.timeRow}>
          {TIME_FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setTimeFilter(f)}
              style={[styles.timeChip, {
                backgroundColor: timeFilter === f ? colors.primary + "22" : "transparent",
                borderColor: timeFilter === f ? colors.primary : colors.border,
              }]}
            >
              <Text style={[styles.timeChipText, { color: timeFilter === f ? colors.primary : colors.mutedForeground }]}>{f}</Text>
            </Pressable>
          ))}
        </View>

        {/* Key stats */}
        <View style={styles.grid}>
          <StatCard label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? colors.up : colors.down} icon="percent" colors={colors} />
          <StatCard label="Profit Factor" value={profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} color={profitFactor >= 1.5 ? colors.up : profitFactor >= 1 ? colors.wait : colors.down} icon="zap" colors={colors} />
        </View>
        <View style={styles.grid}>
          <StatCard label="Total PnL" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}%`} color={totalPnl >= 0 ? colors.up : colors.down} icon="trending-up" sub={`${closed.length} closed trades`} colors={colors} />
          <StatCard label="Avg RR" value={avgRR > 0 ? avgRR.toFixed(2) : "—"} icon="activity" colors={colors} />
        </View>
        <View style={styles.grid}>
          <StatCard label="Avg Win" value={avgWin > 0 ? `+${avgWin.toFixed(1)}%` : "—"} color={colors.up} icon="arrow-up" colors={colors} />
          <StatCard label="Avg Loss" value={avgLoss > 0 ? `-${avgLoss.toFixed(1)}%` : "—"} color={colors.down} icon="arrow-down" colors={colors} />
        </View>

        {/* Streaks */}
        <StreakCard current={currentStreak} longestWin={longestWin} longestLoss={longestLoss} colors={colors} />

        {/* Direction performance */}
        {(longTrades.length > 0 || shortTrades.length > 0) && (
          <BarChart
            label="WIN RATE BY DIRECTION"
            data={[
              { label: "LONG", value: longWR, color: colors.long },
              { label: "SHORT", value: shortWR, color: colors.short },
            ]}
            colors={colors}
          />
        )}

        {/* Signal history stats */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>SIGNALS GENERATED (SESSION)</Text>
          <View style={styles.sigRow}>
            {[
              { label: "Total", value: totalSignals, color: colors.foreground },
              { label: "LONG", value: longSigs, color: colors.long },
              { label: "SHORT", value: shortSigs, color: colors.short },
              { label: "WAIT", value: waitSigs, color: colors.wait },
            ].map((s) => (
              <View key={s.label} style={styles.sigItem}>
                <Text style={[styles.sigVal, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.sigLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Setup quality */}
        {closed.length > 0 && (() => {
          const byQuality: Record<string, { wins: number; total: number }> = {};
          for (const t of closed) {
            const q = t.setupQuality || "Unknown";
            if (!byQuality[q]) byQuality[q] = { wins: 0, total: 0 };
            byQuality[q].total++;
            if ((t.pnlPct ?? 0) > 0) byQuality[q].wins++;
          }
          const items = Object.entries(byQuality).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
          if (!items.length) return null;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.sec, { color: colors.mutedForeground }]}>PERFORMANCE BY SETUP TYPE</Text>
              {items.map(([q, s]) => {
                const wr = Math.round((s.wins / s.total) * 100);
                const c = wr >= 50 ? colors.up : colors.down;
                return (
                  <View key={q} style={styles.qRow}>
                    <Text style={[styles.qLabel, { color: colors.foreground }]}>{q}</Text>
                    <View style={[styles.qTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.qFill, { width: `${wr}%` as any, backgroundColor: c }]} />
                    </View>
                    <Text style={[styles.qPct, { color: c }]}>{wr}%</Text>
                    <Text style={[styles.qCount, { color: colors.mutedForeground }]}>{s.total}t</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {closed.length === 0 && (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="activity" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No closed trades</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Log trades in your Trade Journal and close them to see performance analytics here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  content: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },

  timeRow: { flexDirection: "row", gap: 6 },
  timeChip: { flex: 1, borderRadius: 7, borderWidth: 1, paddingVertical: 7, alignItems: "center" },
  timeChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  grid: { flexDirection: "row", gap: 10 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  sec: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },

  sigRow: { flexDirection: "row", justifyContent: "space-around" },
  sigItem: { alignItems: "center", gap: 2 },
  sigVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  sigLbl: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },

  qRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 80 },
  qTrack: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  qFill: { height: 5, borderRadius: 3 },
  qPct: { fontSize: 11, fontFamily: "Inter_700Bold", width: 32, textAlign: "right" },
  qCount: { fontSize: 10, fontFamily: "Inter_400Regular", width: 22 },

  empty: { borderRadius: 14, borderWidth: 1, padding: 28, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },
});
