import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { COIN_MAP, COINS } from "@/constants/coins";
import { useMultiCoinData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";

interface RankedCoin {
  symbol: string;
  ticker: string;
  color: string;
  signal: "LONG" | "SHORT" | "WAIT";
  probability: number;
  confidence: number;
  setupQuality: string;
  confluenceScore: number;
  totalScore: number;
  rank: number;
}

function qualityRank(q: string): number {
  switch (q) {
    case "High Conviction": return 5;
    case "Strong": return 4;
    case "Strong Setup": return 4;
    case "Moderate": return 3;
    case "Moderate Setup": return 3;
    case "Weak": return 2;
    case "Weak Setup": return 2;
    default: return 1;
  }
}

export default function BestOpportunitiesCard() {
  const colors = useColors();
  const allEngines = useMultiCoinData();

  const ranked: RankedCoin[] = useMemo(() => {
    return COINS
      .map((coin) => {
        const engine = allEngines[coin.symbol];
        const { analysis, probability } = engine;
        const confidence = Math.round((Math.abs(analysis.totalScore) / analysis.maxTotalScore) * 100);
        const compositeScore =
          probability.probability * 0.4 +
          confidence * 0.3 +
          qualityRank(probability.setupQuality) * 10 * 0.2 +
          probability.confluenceScore * 3 * 0.1;

        return {
          symbol: coin.symbol,
          ticker: coin.ticker,
          color: coin.color,
          signal: analysis.signal,
          probability: probability.probability,
          confidence,
          setupQuality: probability.setupQuality,
          confluenceScore: probability.confluenceScore,
          totalScore: compositeScore,
          rank: 0,
        };
      })
      .filter((c) => c.signal !== "WAIT" || c.probability > 30)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3)
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }, [allEngines]);

  if (ranked.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>BEST OPPORTUNITIES</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Ranked by confluence</Text>
      </View>

      {ranked.map((coin) => {
        const sigColor =
          coin.signal === "LONG" ? colors.long :
          coin.signal === "SHORT" ? colors.short : colors.wait;
        const rankColors = ["#F7931A", "#B0BEC5", "#CD7F32"];
        const rankColor = rankColors[coin.rank - 1] ?? colors.mutedForeground;

        return (
          <View
            key={coin.symbol}
            style={[
              styles.row,
              { backgroundColor: coin.color + "0A", borderColor: coin.color + "30" },
            ]}
          >
            {/* Rank */}
            <View style={[styles.rankBadge, { borderColor: rankColor + "60" }]}>
              <Text style={[styles.rankText, { color: rankColor }]}>#{coin.rank}</Text>
            </View>

            {/* Coin + signal */}
            <View style={styles.middle}>
              <View style={styles.coinRow}>
                <View style={[styles.coinBadge, { backgroundColor: coin.color + "22", borderColor: coin.color + "50" }]}>
                  <Text style={[styles.coinTicker, { color: coin.color }]}>{coin.ticker}</Text>
                </View>
                <View style={[styles.sigBadge, { backgroundColor: sigColor + "18", borderColor: sigColor + "40" }]}>
                  <Text style={[styles.sigText, { color: sigColor }]}>{coin.signal}</Text>
                </View>
              </View>
              <Text style={[styles.quality, { color: colors.mutedForeground }]}>{coin.setupQuality}</Text>
            </View>

            {/* Stats */}
            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: sigColor }]}>{coin.probability}%</Text>
                <Text style={[styles.statKey, { color: colors.mutedForeground }]}>Prob</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: colors.foreground }]}>{coin.confidence}%</Text>
                <Text style={[styles.statKey, { color: colors.mutedForeground }]}>Conf</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: colors.foreground }]}>{coin.confluenceScore}/8</Text>
                <Text style={[styles.statKey, { color: colors.mutedForeground }]}>Match</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  middle: {
    flex: 1,
    gap: 4,
  },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  coinBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  coinTicker: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  sigBadge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sigText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  quality: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  stats: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  statVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  statKey: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
