import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CandleChart from "@/components/CandleChart";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { type Interval, useKlineData } from "@/hooks/useKlineData";
import { useLevelAnalysis } from "@/hooks/useLevelAnalysis";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1m",  value: "1m"  },
  { label: "5m",  value: "5m"  },
  { label: "15m", value: "15m" },
  { label: "1h",  value: "1h"  },
  { label: "4h",  value: "4h"  },
];

const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (a: number, b: number) => b === 0 ? "—" : `${((a - b) / b * 100).toFixed(2)}%`;

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  if (d < 5_000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1_000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.2, duration: 800, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: anim }]} />;
}

function LevelRow({ label, value, refPrice, upColor, downColor, labelColor, foreground }: {
  label: string; value: number; refPrice: number; upColor: string; downColor: string; labelColor: string; foreground: string;
}) {
  if (!value) return null;
  const diff = refPrice ? fmtPct(value, refPrice) : "";
  const isAbove = value > refPrice;
  const c = isAbove ? upColor : downColor;
  return (
    <View style={styles.lvRow}>
      <Text style={[styles.lvKey, { color: labelColor }]}>{label}</Text>
      <View style={styles.lvRight}>
        {!!diff && <Text style={[styles.lvDiff, { color: c }]}>{isAbove ? "+" : ""}{diff}</Text>}
        <Text style={[styles.lvVal, { color: foreground }]}>${fmt2(value)}</Text>
      </View>
    </View>
  );
}

export default function ChartScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const [interval, setInterval] = useState<Interval>("5m");

  const { data, analysis } = useTradingData();
  const { candles, loading, lastKlineUpdate } = useKlineData(interval);
  const levels = useLevelAnalysis(candles, data.price);

  /* Price freshness */
  const freshColor =
    data.freshnessStatus === "live"    ? colors.up :
    data.freshnessStatus === "warning" ? colors.wait :
    data.freshnessStatus === "delayed" ? colors.wait : colors.down;
  const freshLabel =
    data.freshnessStatus === "live"        ? "LIVE" :
    data.freshnessStatus === "warning"     ? "WARN" :
    data.freshnessStatus === "delayed"     ? "DELAY" : "OFFLINE";

  const sigColor = analysis.signal === "LONG" ? colors.long : analysis.signal === "SHORT" ? colors.short : undefined;
  const entry = analysis.entry;

  const overlays = {
    supportLevels: levels.supportLevels.slice(0, 3).map((l) => l.price),
    resistanceLevels: levels.resistanceLevels.slice(0, 3).map((l) => l.price),
    supplyZones: levels.supplyZones.slice(0, 2),
    demandZones: levels.demandZones.slice(0, 2),
    entryZone: entry ? { top: entry.entryHigh, bottom: entry.entryLow } : undefined,
    stopLoss: entry?.stopLoss,
    takeProfits: entry ? [entry.takeProfit1, entry.takeProfit2, entry.takeProfit3] : undefined,
    signalColor: sigColor,
  };

  const biasColor = levels.chartBias === "Bullish" ? colors.up : levels.chartBias === "Bearish" ? colors.down : colors.mutedForeground;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 6, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => { Haptics.selectionAsync(); router.back(); }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={[styles.pair, { color: colors.mutedForeground }]}>BTC / USDT · PERP</Text>
          <Text style={[styles.price, { color: data.price === 0 ? colors.mutedForeground : colors.foreground }]}>
            {data.price === 0 ? "Connecting…" : `$${fmt2(data.price)}`}
          </Text>
        </View>
        <View style={styles.freshGroup}>
          <PulseDot color={freshColor} />
          <Text style={[styles.freshLabel, { color: freshColor }]}>{freshLabel}</Text>
          <Text style={[styles.freshAge, { color: colors.mutedForeground }]}>{data.dataAge > 0 ? `${data.dataAge}s` : ""}</Text>
        </View>
      </View>

      {/* Timeframe tabs */}
      <View style={[styles.tfRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {INTERVALS.map((iv) => {
          const active = iv.value === interval;
          return (
            <Pressable
              key={iv.value}
              style={[styles.tfBtn, { backgroundColor: active ? colors.primary : "transparent" }]}
              onPress={() => { Haptics.selectionAsync(); setInterval(iv.value); }}
            >
              <Text style={[styles.tfText, { color: active ? "#fff" : colors.mutedForeground }]}>{iv.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Chart */}
      <View style={[styles.chartWrap, { borderBottomColor: colors.border }]}>
        <CandleChart
          candles={candles}
          loading={loading}
          width={screenWidth}
          height={300}
          upColor={colors.up}
          downColor={colors.down}
          gridColor={colors.border}
          labelColor={colors.mutedForeground}
          overlays={overlays}
          maxCandles={80}
        />
        {lastKlineUpdate > 0 && (
          <Text style={[styles.chartAge, { color: colors.mutedForeground }]}>
            Chart updated {timeAgo(lastKlineUpdate)}
          </Text>
        )}
      </View>

      {/* Scrollable panels */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.panels, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Key levels */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>KEY LEVELS</Text>
            {analysis.signal !== "WAIT" && (
              <View style={[styles.sigBadge, { backgroundColor: (sigColor ?? colors.wait) + "20", borderColor: (sigColor ?? colors.wait) + "50" }]}>
                <Text style={[styles.sigBadgeText, { color: sigColor ?? colors.wait }]}>{analysis.signal}</Text>
              </View>
            )}
          </View>

          <View style={[styles.curPriceRow, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
            <Text style={[styles.curPriceKey, { color: colors.mutedForeground }]}>Current Price</Text>
            <Text style={[styles.curPriceVal, { color: colors.primary }]}>
              {data.price === 0 ? "—" : `$${fmt2(data.price)}`}
            </Text>
          </View>

          <View style={[styles.table, { borderColor: colors.border }]}>
            <LevelRow label="Nearest Support"    value={levels.nearestSupport}   refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
            <View style={[styles.thin, { backgroundColor: colors.border }]} />
            <LevelRow label="Nearest Resistance" value={levels.nearestResistance} refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
            <View style={[styles.thin, { backgroundColor: colors.border }]} />
            <LevelRow label="Strong Support"     value={levels.strongSupport}    refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
            <View style={[styles.thin, { backgroundColor: colors.border }]} />
            <LevelRow label="Strong Resistance"  value={levels.strongResistance} refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
            <View style={[styles.thin, { backgroundColor: colors.border }]} />
            <LevelRow label="Breakout Level"     value={levels.breakoutLevel}    refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
            <View style={[styles.thin, { backgroundColor: colors.border }]} />
            <LevelRow label="Breakdown Level"    value={levels.breakdownLevel}   refPrice={data.price} upColor={colors.up} downColor={colors.down} labelColor={colors.mutedForeground} foreground={colors.secondaryForeground} />
          </View>
        </View>

        {/* Chart summary */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>CHART SUMMARY</Text>
          {[
            { label: "Market Structure", value: analysis.ms?.dominantTrend ?? levels.chartBias, color: biasColor },
            { label: "Trend Direction",  value: levels.chartBias === "Bullish" ? "Uptrend" : levels.chartBias === "Bearish" ? "Downtrend" : "Ranging", color: biasColor },
            { label: "Support Strength", value: levels.supportStrength,    color: levels.supportStrength === "Strong" ? colors.up : levels.supportStrength === "Medium" ? colors.wait : colors.down },
            { label: "Resistance Strength", value: levels.resistanceStrength, color: levels.resistanceStrength === "Strong" ? colors.down : levels.resistanceStrength === "Medium" ? colors.wait : colors.mutedForeground },
            { label: "Chart Bias",       value: levels.chartBias,          color: biasColor },
          ].map((row, i, arr) => (
            <React.Fragment key={row.label}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.summaryVal, { color: row.color }]}>{row.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={[styles.thin, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Signal trade levels */}
        {entry && analysis.signal !== "WAIT" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: (sigColor ?? colors.wait) + "50" }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.sec, { color: colors.mutedForeground }]}>SIGNAL LEVELS</Text>
              <View style={[styles.sigBadge, { backgroundColor: (sigColor ?? colors.wait) + "20", borderColor: (sigColor ?? colors.wait) + "50" }]}>
                <Text style={[styles.sigBadgeText, { color: sigColor ?? colors.wait }]}>{analysis.signal}</Text>
              </View>
            </View>
            <View style={[styles.entryBox, { backgroundColor: (sigColor ?? colors.wait) + "10", borderColor: (sigColor ?? colors.wait) + "30" }]}>
              <Text style={[styles.entryKey, { color: colors.mutedForeground }]}>Entry Zone</Text>
              <Text style={[styles.entryVal, { color: sigColor ?? colors.wait }]}>${fmt2(entry.entryLow)} – ${fmt2(entry.entryHigh)}</Text>
            </View>
            <View style={[styles.table, { borderColor: colors.border }]}>
              {[
                { label: "Stop Loss",     price: entry.stopLoss,    pct: entry.riskPct, c: colors.down, arrow: "▼" },
                { label: "Take Profit 1", price: entry.takeProfit1, pct: entry.tp1Pct,  c: colors.up,   arrow: "▲" },
                { label: "Take Profit 2", price: entry.takeProfit2, pct: entry.tp2Pct,  c: colors.up,   arrow: "▲" },
                { label: "Take Profit 3", price: entry.takeProfit3, pct: entry.tp3Pct,  c: colors.up,   arrow: "▲" },
              ].map((r, i, arr) => (
                <React.Fragment key={r.label}>
                  <View style={styles.lvRow}>
                    <Text style={[styles.lvKey, { color: colors.mutedForeground }]}>{r.label}</Text>
                    <View style={styles.lvRight}>
                      <Text style={[styles.lvDiff, { color: r.c }]}>{r.arrow} {r.pct.toFixed(2)}%</Text>
                      <Text style={[styles.lvVal, { color: r.c }]}>${fmt2(r.price)}</Text>
                    </View>
                  </View>
                  {i < arr.length - 1 && <View style={[styles.thin, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))}
            </View>
            <View style={styles.rrRow}>
              <Text style={[styles.rrKey, { color: colors.mutedForeground }]}>Risk / Reward</Text>
              <Text style={[styles.rrVal, { color: colors.foreground }]}>{entry.rrLabel}</Text>
            </View>
          </View>
        )}

        {/* Market data */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sec, { color: colors.mutedForeground }]}>MARKET DATA</Text>
          {[
            { label: "Last Price",    value: data.price     ? `$${fmt2(data.price)}`        : "—" },
            { label: "Mark Price",    value: data.markPrice ? `$${fmt2(data.markPrice)}`    : "—" },
            { label: "Index Price",   value: data.indexPrice ? `$${fmt2(data.indexPrice)}`  : "—" },
            { label: "Funding Rate",  value: `${(data.fundingRate * 100).toFixed(4)}%` },
            { label: "Open Interest", value: data.openInterest ? `${(data.openInterest / 1e9).toFixed(2)}B` : "—" },
            { label: "Price Status",  value: `${data.freshnessStatus.toUpperCase()}${data.dataAge > 0 ? ` · ${data.dataAge}s` : ""}`, color: freshColor },
            { label: "Chart Updated", value: lastKlineUpdate ? timeAgo(lastKlineUpdate) : "—" },
          ].map((r, i, arr) => (
            <React.Fragment key={r.label}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryKey, { color: colors.mutedForeground }]}>{r.label}</Text>
                <Text style={[styles.summaryVal, { color: r.color ?? colors.secondaryForeground }]}>{r.value}</Text>
              </View>
              {i < arr.length - 1 && <View style={[styles.thin, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerMid: { flex: 1, gap: 1 },
  pair: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
  price: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  freshGroup: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  freshLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  freshAge: { fontSize: 10, fontFamily: "Inter_400Regular" },

  tfRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderBottomWidth: 1 },
  tfBtn: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: "center" },
  tfText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  chartWrap: { borderBottomWidth: 1, paddingVertical: 6 },
  chartAge: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right", paddingRight: 62, paddingTop: 2, paddingBottom: 2 },

  scroll: { flex: 1 },
  panels: { paddingHorizontal: 14, paddingTop: 12, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  thin: { height: 1 },

  curPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  curPriceKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  curPriceVal: { fontSize: 14, fontFamily: "Inter_700Bold" },

  table: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  lvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9 },
  lvKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  lvRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  lvDiff: { fontSize: 11, fontFamily: "Inter_500Medium" },
  lvVal: { fontSize: 13, fontFamily: "Inter_700Bold" },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  summaryKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  sigBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sigBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },

  entryBox: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  entryVal: { fontSize: 13, fontFamily: "Inter_700Bold" },

  rrRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rrKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rrVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
