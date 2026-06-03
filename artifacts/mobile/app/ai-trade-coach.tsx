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

import { COINS } from "@/constants/coins";
import { useMultiCoinData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";

function CoinCoachCard({ coin, analysis, colors }: { coin: any; analysis: any; colors: ReturnType<typeof useColors> }) {
  const biasColor =
    analysis.marketBias === "Bullish" ? colors.up : analysis.marketBias === "Bearish" ? colors.down : colors.mutedForeground;
  const confidence = Math.round((Math.abs(analysis.totalScore) / analysis.maxTotalScore) * 100);

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {/* Header with coin and bias */}
      <View style={s.cardHeader}>
        <View style={[s.coinBadge, { backgroundColor: coin.color + "22", borderColor: coin.color + "50" }]}>
          <Text style={[s.coinTicker, { color: coin.color }]}>{coin.ticker}</Text>
        </View>
        <View style={s.biasInfo}>
          <Text style={[s.biasLabel, { color: biasColor }]}>{analysis.marketBias}</Text>
          <Text style={[s.confidence, { color: biasColor }]}>{confidence}%</Text>
        </View>
      </View>

      {/* Reasoning */}
      <View style={s.reasoningSection}>
        <Text style={[s.label, { color: colors.mutedForeground }]}>Market Analysis</Text>
        {analysis.reasons.slice(0, 3).map((reason: string, i: number) => (
          <Text key={i} style={[s.reason, { color: colors.foreground }]}>
            • {reason}
          </Text>
        ))}
      </View>

      {/* Entry details */}
      {analysis.entry && (
        <View style={s.entrySection}>
          <Text style={[s.label, { color: colors.mutedForeground }]}>Entry Levels</Text>
          <View style={s.levelRow}>
            <Text style={[s.levelLabel, { color: colors.mutedForeground }]}>Entry Zone:</Text>
            <Text style={[s.levelValue, { color: colors.foreground }]}>
              ${analysis.entry.entryLow.toFixed(2)} - ${analysis.entry.entryHigh.toFixed(2)}
            </Text>
          </View>
          <View style={s.levelRow}>
            <Text style={[s.levelLabel, { color: colors.mutedForeground }]}>Stop Loss:</Text>
            <Text style={[s.levelValue, { color: colors.down }]}>${analysis.entry.stopLoss.toFixed(2)}</Text>
          </View>
          <View style={s.levelRow}>
            <Text style={[s.levelLabel, { color: colors.mutedForeground }]}>Target 1:</Text>
            <Text style={[s.levelValue, { color: colors.up }]}>${analysis.entry.takeProfit1.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function AITradeCoachScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const allEngines = useMultiCoinData();

  const coachData = useMemo(() => {
    return COINS.map((coin) => ({
      coin,
      analysis: allEngines[coin.symbol]?.analysis || {},
    }));
  }, [allEngines]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>AI Trade Coach</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {coachData.map((item) => (
          <CoinCoachCard key={item.coin.symbol} coin={item.coin} analysis={item.analysis} colors={colors} />
        ))}
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
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  coinBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  coinTicker: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  biasInfo: { flex: 1 },
  biasLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  confidence: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  reasoningSection: { marginBottom: 12 },
  entrySection: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.1)" },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  reason: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4, lineHeight: 18 },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  levelLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  levelValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
