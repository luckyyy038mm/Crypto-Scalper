import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
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

import { useMultiCoinData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { usePaperTrading } from "@/hooks/usePaperTrading";

function StatCard({
  label,
  value,
  unit,
  color,
  colors,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[s.statValue, { color: color || colors.foreground }]}>
        {value}
        {unit && <Text style={s.statUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

function PerformanceGrid({ title, items, colors }: { title: string; items: any[]; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={s.grid}>
        {items.map((item, i) => (
          <StatCard key={i} {...item} colors={colors} />
        ))}
      </View>
    </View>
  );
}

export default function PerformanceCenterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const allEngines = useMultiCoinData();
  const prices = useMemo(
    () => Object.fromEntries(Object.entries(allEngines).map(([coin, engine]) => [coin, engine.data.price])),
    [allEngines]
  );

  const { analytics } = usePaperTrading(prices as any);

  const summaryItems = [
    { label: "Total Trades", value: analytics.totalTrades, unit: "" },
    { label: "Win Rate", value: analytics.winRate.toFixed(1), unit: "%" },
    { label: "Profit Factor", value: analytics.profitFactor.toFixed(2), unit: "" },
    { label: "Avg Risk:Reward", value: analytics.avgRR.toFixed(2), unit: "" },
  ];

  const profitItems = [
    { label: "Total Simulated Profit", value: `$${analytics.totalPnl.toFixed(2)}`, unit: "" },
    { label: "Total PnL %", value: analytics.totalPnlPct.toFixed(2), unit: "%", color: analytics.totalPnl >= 0 ? colors.up : colors.down },
    { label: "Daily PnL", value: `$${analytics.dailyPnl.toFixed(2)}`, unit: "", color: analytics.dailyPnl >= 0 ? colors.up : colors.down },
    { label: "Winning Trades", value: analytics.wins, unit: "", color: colors.up },
    { label: "Losing Trades", value: analytics.losses, unit: "", color: colors.down },
    { label: "Current Balance", value: `$${analytics.totalBalance.toFixed(2)}`, unit: "" },
  ];

  const coinAccuracyItems = analytics.coinAccuracy.map((c) => ({
    label: `${c.coin.replace("USDT", "")} Accuracy`,
    value: c.accuracy.toFixed(1),
    unit: "%",
    color: c.accuracy >= 50 ? colors.up : colors.down,
  }));

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Performance Center</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        <PerformanceGrid title="Trading Summary" items={summaryItems} colors={colors} />
        <PerformanceGrid title="Profitability" items={profitItems} colors={colors} />
        {coinAccuracyItems.length > 0 && (
          <PerformanceGrid title="Signal Accuracy by Coin" items={coinAccuracyItems} colors={colors} />
        )}

        {/* Streak info */}
        {(analytics.curStreak !== 0 || analytics.longestWin > 0 || analytics.longestLoss > 0) && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>Streaks</Text>
            <View style={s.grid}>
              <StatCard
                label="Current Streak"
                value={analytics.curStreak}
                colors={colors}
                color={analytics.curStreak > 0 ? colors.up : colors.down}
              />
              <StatCard label="Longest Win Streak" value={analytics.longestWin} colors={colors} color={colors.up} />
              <StatCard label="Longest Loss Streak" value={analytics.longestLoss} colors={colors} color={colors.down} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 0.48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statUnit: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
