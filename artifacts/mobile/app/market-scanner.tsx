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

function OpportunityRow({
  rank,
  coin,
  signal,
  confidence,
  colors,
}: {
  rank: number;
  coin: any;
  signal: string;
  confidence: number;
  colors: ReturnType<typeof useColors>;
}) {
  const sigColor =
    signal === "LONG" ? colors.up : signal === "SHORT" ? colors.down : colors.mutedForeground;
  const bgColor = signal === "LONG" ? colors.up + "12" : signal === "SHORT" ? colors.down + "12" : colors.background;

  return (
    <View style={[s.row, { backgroundColor: bgColor, borderColor: colors.border }]}>
      <View style={s.rankSection}>
        <Text style={[s.rank, { color: colors.primary }]}>{rank}</Text>
      </View>
      <View style={s.coinSection}>
        <View style={[s.coinBadge, { backgroundColor: coin.color + "22", borderColor: coin.color + "50" }]}>
          <Text style={[s.coinTicker, { color: coin.color }]}>{coin.ticker}</Text>
        </View>
        <Text style={[s.coinName, { color: colors.foreground }]}>{coin.name}</Text>
      </View>
      <View style={s.signalSection}>
        <Text style={[s.signal, { color: sigColor }]}>{signal}</Text>
        <Text style={[s.confidenceValue, { color: sigColor }]}>{confidence}%</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </View>
  );
}

export default function MarketScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const allEngines = useMultiCoinData();

  const rankedCoins = useMemo(() => {
    return COINS.map((coin) => {
      const engine = allEngines[coin.symbol];
      const analysis = engine?.analysis;
      const confidence = Math.round((Math.abs(analysis?.totalScore || 0) / (analysis?.maxTotalScore || 40)) * 100);
      return {
        coin,
        signal: analysis?.signal || "WAIT",
        confidence: Math.min(100, confidence),
        qualityScore: analysis?.signalQualityScore || 0,
      };
    }).sort((a, b) => b.qualityScore - a.qualityScore);
  }, [allEngines]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Market Scanner</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Scanner Content */}
      <ScrollView style={s.content} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Best Opportunity */}
        {rankedCoins.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>🎯 Best Opportunity Right Now</Text>
            <OpportunityRow
              rank={1}
              coin={rankedCoins[0].coin}
              signal={rankedCoins[0].signal}
              confidence={rankedCoins[0].confidence}
              colors={colors}
            />
          </View>
        )}

        {/* All ranked coins */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>All Opportunities (Ranked)</Text>
          {rankedCoins.map((item, i) => (
            <OpportunityRow
              key={item.coin.symbol}
              rank={i + 1}
              coin={item.coin}
              signal={item.signal}
              confidence={item.confidence}
              colors={colors}
            />
          ))}
        </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankSection: { width: 28 },
  rank: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  coinSection: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  coinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  coinTicker: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  coinName: { fontSize: 12, fontFamily: "Inter_500Medium" },
  signalSection: { alignItems: "flex-end", marginRight: 8 },
  signal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  confidenceValue: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
});
