import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCoin } from "@/context/CoinContext";
import { useColors } from "@/hooks/useColors";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"] as const;
const INDICATORS = [
  "SMA 20",
  "SMA 50",
  "EMA 9",
  "RSI",
  "MACD",
  "Bollinger Bands",
  "VWAP",
  "ATR",
] as const;

export default function TradingViewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedCoin } = useCoin();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("15m");
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["EMA 9", "RSI"]);

  const toggleIndicator = (indicator: string) => {
    setActiveIndicators((prev) =>
      prev.includes(indicator)
        ? prev.filter((i) => i !== indicator)
        : [...prev, indicator]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trading View</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {selectedCoin?.symbol || "BTC/USDT"}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Timeframe Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TIMEFRAME</Text>
          <View style={[styles.buttonGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {TIMEFRAMES.map((tf) => (
              <TouchableOpacity
                key={tf}
                onPress={() => setSelectedTimeframe(tf)}
                style={[
                  styles.tfButton,
                  selectedTimeframe === tf && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.tfButtonText,
                    { color: selectedTimeframe === tf ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chart Placeholder */}
        <View style={[styles.chartContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartPlaceholder}>
            <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
              📊 TradingView Chart
            </Text>
            <Text style={[styles.placeholderSubtext, { color: colors.mutedForeground }]}>
              Interactive chart with {selectedTimeframe} timeframe
            </Text>
            <Text style={[styles.placeholderSubtext, { color: colors.primary }]}>
              {selectedCoin?.symbol || "BTC/USDT"}
            </Text>
          </View>
        </View>

        {/* Indicators Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>INDICATORS</Text>
          <View style={styles.indicatorsGrid}>
            {INDICATORS.map((indicator) => {
              const isActive = activeIndicators.includes(indicator);
              return (
                <TouchableOpacity
                  key={indicator}
                  onPress={() => toggleIndicator(indicator)}
                  style={[
                    styles.indicatorChip,
                    {
                      backgroundColor: isActive ? colors.primary : colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.indicatorText,
                      { color: isActive ? "#fff" : colors.foreground },
                    ]}
                  >
                    {indicator}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Active Indicators Summary */}
        {activeIndicators.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACTIVE INDICATORS</Text>
            <View style={[styles.activeIndicatorsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {activeIndicators.map((indicator, index) => (
                <View
                  key={indicator}
                  style={[
                    styles.activeIndicatorItem,
                    index < activeIndicators.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                  ]}
                >
                  <View style={[styles.indicatorDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.activeIndicatorText, { color: colors.foreground }]}>{indicator}</Text>
                  <TouchableOpacity onPress={() => toggleIndicator(indicator)}>
                    <Text style={[styles.removeText, { color: colors.primary }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>QUICK ACTIONS</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.actionIcon]}>📐</Text>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Drawing Tools</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.actionIcon]}>📋</Text>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>Templates</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
          <Text style={[styles.infoTitle, { color: colors.primary }]}>TradingView Integration</Text>
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            This screen provides access to TradingView charts with advanced technical analysis tools.
            Customize your indicators and timeframes for optimal trading insights.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  buttonGroup: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
  },
  tfButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tfButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chartContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  chartPlaceholder: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  indicatorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  indicatorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  indicatorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  activeIndicatorsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  activeIndicatorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeIndicatorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  removeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
});