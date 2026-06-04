import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COINS, COIN_MAP, type CoinSymbol } from "@/constants/coins";
import { useSelectedCoin } from "@/context/CoinContext";
import { useColors } from "@/hooks/useColors";
import { useBinanceData } from "@/hooks/useBinanceData";

interface CoinSelectorProps {
  compact?: boolean;
}

interface CoinListItemProps {
  symbol: CoinSymbol;
  isActive: boolean;
  onSelect: () => void;
}

function CoinListItem({ symbol, isActive, onSelect }: CoinListItemProps) {
  const colors = useColors();
  const coin = COIN_MAP[symbol];
  const binanceData = useBinanceData(symbol);
  const priceUp = binanceData.priceChange >= 0;

  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.coinItem,
        { backgroundColor: isActive ? colors.primary + "14" : "transparent" },
      ]}
    >
      <View style={styles.coinLeft}>
        <View style={[styles.coinDot, { backgroundColor: coin.color }]} />
        <View>
          <Text style={[styles.coinTicker, { color: isActive ? coin.color : colors.foreground }]}>
            {coin.ticker}
          </Text>
          <Text style={[styles.coinName, { color: colors.mutedForeground }]}>{coin.name}</Text>
        </View>
      </View>
      <View style={styles.coinRight}>
        <Text style={[styles.coinPrice, { color: colors.foreground }]}>
          {binanceData.price > 0 ? `$${binanceData.price.toLocaleString("en-US", { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}` : "—"}
        </Text>
        <View style={[styles.changeBadge, { backgroundColor: priceUp ? colors.up + "20" : colors.down + "20" }]}>
          <Feather name={priceUp ? "arrow-up" : "arrow-down"} size={10} color={priceUp ? colors.up : colors.down} />
          <Text style={[styles.changeText, { color: priceUp ? colors.up : colors.down }]}>
            {binanceData.priceChangePercent > 0 ? "+" : ""}{binanceData.priceChangePercent.toFixed(2)}%
          </Text>
        </View>
      </View>
      {isActive && <Feather name="check" size={16} color={coin.color} style={styles.checkIcon} />}
    </Pressable>
  );
}

export default function CoinSelector({ compact = false }: CoinSelectorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedCoin, setCoin } = useSelectedCoin();
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;

  const coin = COIN_MAP[selectedCoin];
  const binanceData = useBinanceData(selectedCoin);
  const priceUp = binanceData.priceChange >= 0;

  useEffect(() => {
    if (showModal) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showModal]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, 0],
  });

  const filteredCoins = COINS.filter(
    (c) =>
      c.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (symbol: CoinSymbol) => {
    Haptics.selectionAsync();
    setCoin(symbol);
    setShowModal(false);
    setSearchQuery("");
  };

  const handleClose = () => {
    setShowModal(false);
    setSearchQuery("");
  };

  return (
    <>
      {/* Compact Pill Selector */}
      {compact ? (
        <Pressable
          onPress={() => setShowModal(true)}
          style={[styles.compactPill, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={[styles.coinDot, { backgroundColor: coin.color }]} />
          <Text style={[styles.compactText, { color: colors.foreground }]}>{coin.ticker}</Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        /* Full Binance-style Selector */
        <Pressable
          onPress={() => setShowModal(true)}
          style={[styles.selector, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <View style={styles.selectorLeft}>
            <View style={[styles.selectorBadge, { backgroundColor: coin.color + "20", borderColor: coin.color + "40" }]}>
              <Text style={[styles.selectorBadgeText, { color: coin.color }]}>{coin.ticker}</Text>
            </View>
            <View>
              <Text style={[styles.selectorPrice, { color: colors.foreground }]}>
                {binanceData.price > 0 ? `$${binanceData.price.toLocaleString("en-US", { minimumFractionDigits: coin.decimals, maximumFractionDigits: coin.decimals })}` : "Loading..."}
              </Text>
              <View style={styles.selectorChange}>
                <Feather name={priceUp ? "arrow-up" : "arrow-down"} size={10} color={priceUp ? colors.up : colors.down} />
                <Text style={[styles.selectorChangeText, { color: priceUp ? colors.up : colors.down }]}>
                  {binanceData.priceChangePercent > 0 ? "+" : ""}{binanceData.priceChangePercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.selectorRight}>
            <View style={[styles.volumePill, { borderColor: colors.border }]}>
              <Text style={[styles.volumeText, { color: colors.mutedForeground }]}>
                Vol: ${(binanceData.quoteVolume / 1000000).toFixed(1)}M
              </Text>
            </View>
            <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
          </View>
        </Pressable>
      )}

      {/* Bottom Sheet Modal - Uses Portal pattern to render at top level */}
      {showModal && (
        <View style={styles.modalPortal}>
          {/* Backdrop */}
          <Animated.View
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          {/* Sheet */}
          <Animated.View
            style={[
              styles.modal,
              {
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY }],
              },
            ]}
          >
            {/* Handle */}
            <View style={styles.handle}>
              <View style={[styles.handleBar, { backgroundColor: colors.mutedForeground }]} />
            </View>

            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Coin</Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search coins..."
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {/* Coin List */}
            <FlatList
              data={filteredCoins}
              keyExtractor={(item) => item.symbol}
              renderItem={({ item }) => (
                <CoinListItem
                  symbol={item.symbol}
                  isActive={item.symbol === selectedCoin}
                  onSelect={() => handleSelect(item.symbol)}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.coinList}
            />
          </Animated.View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  /* Compact styles */
  compactPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 1,
  },
  compactText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  coinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  /* Selector styles */
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 1,
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectorBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  selectorPrice: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  selectorChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  selectorChangeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  selectorRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  volumePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  volumeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },

  /* Modal styles - fixed z-index for proper layering */
  modalPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    zIndex: 101,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  handle: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  coinList: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  coinItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  coinLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coinTicker: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  coinName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  coinRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  coinPrice: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  checkIcon: {
    marginLeft: 12,
  },
});
