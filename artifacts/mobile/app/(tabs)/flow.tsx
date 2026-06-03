import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { useOrderFlow } from "@/hooks/useOrderFlow";

function fmtVol(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}
function fmtUSD(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function MetricCard({ label, value, sub, color, colors }: {
  label: string; value: string; sub?: string; color?: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.metCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.metLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metValue, { color: color ?? colors.foreground }]}>{value}</Text>
      {sub && <Text style={[styles.metSub, { color: colors.mutedForeground }]}>{sub}</Text>}
    </View>
  );
}

function PressureBar({ label, value, barColor, colors }: {
  label: string; value: number; barColor: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.pressRow}>
      <Text style={[styles.pressLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.pressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.pressFill, { width: `${Math.min(100, value)}%` as unknown as number, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.pressPct, { color: barColor }]}>{value}%</Text>
    </View>
  );
}

function ComingSoonCard({ title, description, colors }: { title: string; description: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.csCard, { backgroundColor: colors.card, borderColor: colors.border, borderStyle: "dashed" }]}>
      <View style={styles.csTop}>
        <Text style={[styles.csTitle, { color: colors.mutedForeground }]}>{title}</Text>
        <View style={[styles.csBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.csBadgeText, { color: colors.mutedForeground }]}>Coming Soon</Text>
        </View>
      </View>
      <Text style={[styles.csDesc, { color: colors.mutedForeground }]}>{description}</Text>
    </View>
  );
}

export default function FlowScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const { data } = useTradingData();
  const flow = useOrderFlow(data.price);

  const buyColor = colors.up;
  const sellColor = colors.down;
  const deltaColor = flow.delta >= 0 ? buyColor : sellColor;
  const imbColor = flow.volumeImbalance >= 0 ? buyColor : sellColor;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Order Flow</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Taker volume · Last 3 completed 5m candles
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Buy/Sell split visual */}
        <View style={[styles.splitCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.splitRow}>
            <View style={styles.splitSide}>
              <Text style={[styles.splitPct, { color: buyColor }]}>{flow.buyerAggression}%</Text>
              <Text style={[styles.splitLbl, { color: buyColor }]}>BUY</Text>
              <Text style={[styles.splitVol, { color: colors.mutedForeground }]}>{fmtVol(flow.buyVolume)} BTC</Text>
            </View>
            <View style={styles.splitBarCol}>
              <View style={[styles.splitTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.splitFillBuy, { height: `${flow.buyerAggression}%` as unknown as number, backgroundColor: buyColor }]} />
                <View style={[styles.splitFillSell, { height: `${flow.sellerAggression}%` as unknown as number, backgroundColor: sellColor }]} />
              </View>
            </View>
            <View style={[styles.splitSide, styles.splitRight]}>
              <Text style={[styles.splitPct, { color: sellColor }]}>{flow.sellerAggression}%</Text>
              <Text style={[styles.splitLbl, { color: sellColor }]}>SELL</Text>
              <Text style={[styles.splitVol, { color: colors.mutedForeground }]}>{fmtVol(flow.sellVolume)} BTC</Text>
            </View>
          </View>
          <View style={[styles.splitBarH, { backgroundColor: colors.border }]}>
            <View style={[styles.splitFillH, { width: `${flow.buyerAggression}%` as unknown as number, backgroundColor: buyColor }]} />
          </View>
          <Text style={[styles.environment, { color: colors.secondaryForeground }]}>{flow.environment}</Text>
        </View>

        {/* Metric grid */}
        <View style={styles.grid}>
          <MetricCard label="Buyer Aggression" value={`${flow.buyerAggression}%`} sub="Taker buy ratio" color={buyColor} colors={colors} />
          <MetricCard label="Seller Aggression" value={`${flow.sellerAggression}%`} sub="Taker sell ratio" color={sellColor} colors={colors} />
          <MetricCard label="Delta" value={fmtVol(flow.delta)} sub={fmtUSD(flow.deltaUSD)} color={deltaColor} colors={colors} />
          <MetricCard label="Vol Imbalance" value={`${flow.volumeImbalance > 0 ? "+" : ""}${flow.volumeImbalance}%`} sub="(buy−sell)/total" color={imbColor} colors={colors} />
        </View>

        {/* Pressure bars */}
        <View style={[styles.pressCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>PRESSURE</Text>
          <PressureBar label="Buying" value={flow.buyingPressure} barColor={buyColor} colors={colors} />
          <PressureBar label="Selling" value={flow.sellingPressure} barColor={sellColor} colors={colors} />
        </View>

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>ORDER FLOW SUMMARY</Text>
          <Text style={[styles.summaryText, { color: colors.secondaryForeground }]}>{flow.summary}</Text>
        </View>

        {/* Future features */}
        <Text style={[styles.sec, { color: colors.mutedForeground }]}>ADVANCED FEATURES</Text>

        {[
          { title: "Footprint Charts", desc: "Bid/ask volume at each price level per candle. Reveals absorption and large order activity." },
          { title: "Cumulative Volume Delta (CVD)", desc: "Running total of buy minus sell volume. Identifies hidden divergences between price and order flow." },
          { title: "Absorption Detection", desc: "Detects when large passive orders absorb aggressive market orders, often preceding reversals." },
          { title: "Liquidity Zones", desc: "Identifies clusters of stop orders and limit orders from recent price structure." },
          { title: "Volume Profile", desc: "Shows volume distributed by price level. Highlights key value areas and point of control." },
          { title: "Liquidation Clusters", desc: "Estimates where leveraged positions accumulate based on funding and open interest data." },
        ].map((f) => (
          <ComingSoonCard key={f.title} title={f.title} description={f.desc} colors={colors} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },

  splitCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  splitSide: { flex: 1, gap: 4 },
  splitRight: { alignItems: "flex-end" },
  splitPct: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  splitLbl: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  splitVol: { fontSize: 11, fontFamily: "Inter_400Regular" },
  splitBarCol: { width: 28 },
  splitTrack: { height: 80, borderRadius: 4, overflow: "hidden" },
  splitFillBuy: { borderRadius: 4 },
  splitFillSell: { borderRadius: 4 },
  splitBarH: { height: 6, borderRadius: 3, overflow: "hidden" },
  splitFillH: { height: 6, borderRadius: 3 },
  environment: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metCard: { width: "48%", flexGrow: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  metLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },
  metValue: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  metSub: { fontSize: 10, fontFamily: "Inter_400Regular" },

  pressCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  pressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pressLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 46 },
  pressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  pressFill: { height: 6, borderRadius: 3 },
  pressPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 36, textAlign: "right" },

  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  summaryText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  csCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  csTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  csTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  csBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  csBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  csDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
