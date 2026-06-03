import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { MarketStructure, TrendDir } from "@/hooks/useMarketStructure";

function TrendDot({ trend, colors }: { trend: TrendDir; colors: ReturnType<typeof useColors> }) {
  const color =
    trend === "Bullish" ? colors.up : trend === "Bearish" ? colors.down : colors.mutedForeground;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

interface Props {
  ms: MarketStructure;
}

export default function MarketStructureCard({ ms }: Props) {
  const colors = useColors();
  if (!ms.trends.length) return null;

  const momColor =
    ms.momentumScore > 0 ? colors.up : ms.momentumScore < 0 ? colors.down : colors.mutedForeground;
  const domColor =
    ms.dominantTrend === "Bullish"
      ? colors.up
      : ms.dominantTrend === "Bearish"
        ? colors.down
        : colors.mutedForeground;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>MARKET STRUCTURE</Text>
        <View style={[styles.biasBadge, { borderColor: domColor + "60" }]}>
          <TrendDot trend={ms.dominantTrend} colors={colors} />
          <Text style={[styles.biasLabel, { color: domColor }]}>{ms.dominantTrend}</Text>
        </View>
      </View>

      {/* Trend rows */}
      <View style={styles.trendsGrid}>
        {ms.trends.map((t) => {
          const tColor =
            t.trend === "Bullish"
              ? colors.up
              : t.trend === "Bearish"
                ? colors.down
                : colors.mutedForeground;
          return (
            <View
              key={t.tf}
              style={[styles.trendRow, { borderColor: colors.border }]}
            >
              <Text style={[styles.tfLabel, { color: colors.mutedForeground }]}>
                {t.tf} Trend
              </Text>
              <View style={styles.trendRight}>
                <TrendDot trend={t.trend} colors={colors} />
                <Text style={[styles.trendText, { color: tColor }]}>{t.trend}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Momentum</Text>
          <Text style={[styles.statValue, { color: momColor }]}>
            {ms.momentumScore > 0 ? "+" : ""}{ms.momentumScore}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>→ Support</Text>
          <Text style={[styles.statValue, { color: colors.down }]}>
            {ms.supportPct > 0 ? `-${ms.supportPct.toFixed(2)}%` : "—"}
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>→ Resist.</Text>
          <Text style={[styles.statValue, { color: colors.up }]}>
            {ms.resistancePct > 0 ? `+${ms.resistancePct.toFixed(2)}%` : "—"}
          </Text>
        </View>
      </View>

      {/* Reasoning */}
      {!!ms.reasoning && (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.reasoning, { color: colors.secondaryForeground }]}>
            {ms.reasoning}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  biasBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  biasLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dot: { width: 6, height: 6, borderRadius: 3 },

  trendsGrid: { gap: 0 },
  trendRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 8, borderBottomWidth: 1,
  },
  tfLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  trendRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  trendText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  divider: { height: 1 },

  statsRow: { flexDirection: "row", alignItems: "center" },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statDivider: { width: 1, height: 28 },

  reasoning: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
