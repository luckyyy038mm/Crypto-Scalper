import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COIN_MAP, COINS, formatCoinPrice } from "@/constants/coins";
import { useMultiCoinData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";

export default function MarketOverviewCard() {
  const colors = useColors();
  const allEngines = useMultiCoinData();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.title, { color: colors.mutedForeground }]}>MARKET OVERVIEW</Text>
      <View style={styles.grid}>
        {COINS.map((coin) => {
          const engine = allEngines[coin.symbol];
          const { analysis, data } = engine;
          const confidence = Math.round((Math.abs(analysis.totalScore) / analysis.maxTotalScore) * 100);
          const sigColor =
            analysis.signal === "LONG" ? colors.long :
            analysis.signal === "SHORT" ? colors.short : colors.wait;
          const priceUp = data.priceChangePercent >= 0;
          const priceColor = data.price === 0 ? colors.mutedForeground : priceUp ? colors.up : colors.down;

          return (
            <View
              key={coin.symbol}
              style={[
                styles.coinRow,
                { backgroundColor: colors.background, borderColor: coin.color + "30" },
              ]}
            >
              {/* Coin + price */}
              <View style={styles.coinLeft}>
                <View style={[styles.coinBadge, { backgroundColor: coin.color + "22", borderColor: coin.color + "50" }]}>
                  <Text style={[styles.coinTicker, { color: coin.color }]}>{coin.ticker}</Text>
                </View>
                <View>
                  <Text style={[styles.price, { color: data.price > 0 ? colors.foreground : colors.mutedForeground }]}>
                    {data.price > 0 ? `$${formatCoinPrice(data.price, coin.symbol)}` : "—"}
                  </Text>
                  {data.price > 0 && (
                    <Text style={[styles.change, { color: priceColor }]}>
                      {priceUp ? "+" : ""}{data.priceChangePercent.toFixed(2)}%
                    </Text>
                  )}
                </View>
              </View>

              {/* Signal */}
              <View style={styles.coinRight}>
                <View style={[styles.sigBadge, { backgroundColor: sigColor + "15", borderColor: sigColor + "40" }]}>
                  <Text style={[styles.sigText, { color: sigColor }]}>{analysis.signal}</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={[styles.metaVal, { color: sigColor }]}>{confidence}%</Text>
                  <Text style={[styles.metaKey, { color: colors.mutedForeground }]}>{analysis.marketBias}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
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
  title: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  grid: {
    gap: 7,
  },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  coinLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  coinBadge: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 38,
    alignItems: "center",
  },
  coinTicker: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  change: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  coinRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sigBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 52,
    alignItems: "center",
  },
  sigText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  metaCol: {
    alignItems: "flex-end",
    minWidth: 50,
  },
  metaVal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  metaKey: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
});
