import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COINS, type CoinSymbol } from "@/constants/coins";
import { useSelectedCoin } from "@/context/CoinContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  compact?: boolean;
}

export default function CoinSelector({ compact = false }: Props) {
  const colors = useColors();
  const { selectedCoin, setCoin } = useSelectedCoin();

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {COINS.map((coin) => {
        const active = coin.symbol === selectedCoin;
        return (
          <Pressable
            key={coin.symbol}
            onPress={() => {
              Haptics.selectionAsync();
              setCoin(coin.symbol as CoinSymbol);
            }}
            style={[
              styles.pill,
              compact && styles.pillCompact,
              {
                backgroundColor: active ? coin.color + "22" : "transparent",
                borderColor: active ? coin.color : colors.border,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: active ? coin.color : colors.mutedForeground }]} />
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                { color: active ? coin.color : colors.mutedForeground },
              ]}
            >
              {coin.ticker}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowCompact: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 6,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillCompact: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  labelCompact: {
    fontSize: 11,
  },
});
