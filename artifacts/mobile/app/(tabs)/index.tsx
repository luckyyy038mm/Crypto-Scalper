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

import BestOpportunitiesCard from "@/components/BestOpportunitiesCard";
import CandleChart from "@/components/CandleChart";
import CoinSelector from "@/components/CoinSelector";
import HamburgerButton from "@/components/HamburgerButton";
import MarketOverviewCard from "@/components/MarketOverviewCard";
import ProbabilityCard from "@/components/ProbabilityCard";
import { COIN_MAP, formatCoinPrice } from "@/constants/coins";
import { useSelectedCoin } from "@/context/CoinContext";
import { useTradingData } from "@/context/TradingContext";
import { useColors } from "@/hooks/useColors";
import { type Interval, useKlineData } from "@/hooks/useKlineData";
import { useLevelAnalysis } from "@/hooks/useLevelAnalysis";

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1m",  value: "1m"  },
  { label: "5m",  value: "5m"  },
  { label: "15m", value: "15m" },
  { label: "1h",  value: "1h"  },
];

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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity: anim }]} />;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [interval, setInterval] = useState<Interval>("5m");
  const { selectedCoin } = useSelectedCoin();
  const coinConfig = COIN_MAP[selectedCoin];
  const { data, analysis, probability } = useTradingData();
  const { candles, loading: chartLoading, lastKlineUpdate } = useKlineData(interval, selectedCoin);
  const levels = useLevelAnalysis(candles, data.price);

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const priceUp = data.priceChange >= 0;
  const priceColor = data.price === 0 ? colors.mutedForeground : priceUp ? colors.up : colors.down;
  const sigColor = analysis.signal === "LONG" ? colors.long : analysis.signal === "SHORT" ? colors.short : colors.wait;
  const sigBg    = analysis.signal === "LONG" ? colors.longBg : analysis.signal === "SHORT" ? colors.shortBg : colors.waitBg;
  const sigIcon  = analysis.signal === "LONG" ? "trending-up" : analysis.signal === "SHORT" ? "trending-down" : "minus";
  const confidence = Math.round((Math.abs(analysis.totalScore) / analysis.maxTotalScore) * 100);
  const filled = Math.round(confidence / 20);
  const biasColor = analysis.marketBias === "Bullish" ? colors.up : analysis.marketBias === "Bearish" ? colors.down : colors.mutedForeground;
  const entry = analysis.entry;

  const freshColor =
    data.freshnessStatus === "live"    ? colors.up :
    data.freshnessStatus === "warning" ? colors.wait :
    data.freshnessStatus === "delayed" ? colors.wait : colors.down;
  const freshLabel =
    data.freshnessStatus === "live"    ? "LIVE" :
    data.freshnessStatus === "warning" ? "WARN" :
    data.freshnessStatus === "delayed" ? "DELAY" : "OFFLINE";

  const priceDisplay = data.price === 0
    ? "Connecting…"
    : `$${formatCoinPrice(data.price, selectedCoin)}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <View style={styles.pairRow}>
            <HamburgerButton />
            <Text style={[styles.pair, { color: colors.mutedForeground }]}>{coinConfig.pairLabel}</Text>
          </View>
          <Text style={[styles.price, { color: data.price === 0 ? colors.mutedForeground : colors.foreground }]}>
            {priceDisplay}
          </Text>
          <View style={styles.changeRow}>
            <Feather name={priceUp ? "arrow-up" : "arrow-down"} size={12} color={priceColor} />
            <Text style={[styles.changeText, { color: priceColor }]}>
              {data.price === 0
                ? "Fetching market data…"
                : `${priceUp ? "+" : ""}${data.priceChangePercent.toFixed(2)}%`}
            </Text>
          </View>
        </View>
        <View style={styles.liveGroup}>
          <PulseDot color={freshColor} />
          <View style={styles.liveTextCol}>
            <Text style={[styles.liveText, { color: freshColor }]}>{freshLabel}</Text>
            {data.dataAge > 0 && (
              <Text style={[styles.ageText, { color: colors.mutedForeground }]}>{data.dataAge}s</Text>
            )}
          </View>
        </View>
      </View>

      {/* Coin Selector */}
      <CoinSelector />

      {/* Info bar */}
      {analysis.ready && (
        <View style={[styles.infoBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { key: "Bias",      val: analysis.marketBias,   col: biasColor },
            { key: "Timeframe", val: ('signalTimeframe' in analysis ? (analysis as { signalTimeframe: string }).signalTimeframe : "15m"), col: sigColor },
            { key: "Quality",   val: ('signalQualityScore' in analysis && (analysis as { signalQualityScore: number }).signalQualityScore > 0) ? `${(analysis as { signalQualityScore: number }).signalQualityScore}/100` : analysis.qualityLabel, col: colors.foreground },
          ].map((item, i, arr) => (
            <React.Fragment key={item.key}>
              <View style={styles.infoItem}>
                <Text style={[styles.infoKey, { color: colors.mutedForeground }]}>{item.key}</Text>
                <Text style={[styles.infoVal, { color: item.col }]}>{item.val}</Text>
              </View>
              {i < arr.length - 1 && <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Signal Card */}
        <View style={[styles.sigCard, { backgroundColor: sigBg, borderColor: sigColor }]}>
          <View style={styles.sigTopRow}>
            <View style={styles.sigNameRow}>
              <View style={[styles.coinDot, { backgroundColor: coinConfig.color }]} />
              <Text style={[styles.coinLabel, { color: coinConfig.color }]}>{coinConfig.ticker}</Text>
              <Feather name={sigIcon} size={22} color={sigColor} />
              <Text style={[styles.sigLabel, { color: sigColor }]}>{analysis.signal}</Text>
            </View>
            <View style={[styles.totalPill, { borderColor: sigColor + "60" }]}>
              <Text style={[styles.totalPillText, { color: sigColor }]}>
                {analysis.totalScore > 0 ? "+" : ""}{analysis.totalScore} / {analysis.maxTotalScore}
              </Text>
            </View>
          </View>

          {analysis.factors.length > 0 && (
            <View style={styles.chipsRow}>
              {analysis.factors.map((f) => {
                const c = f.sentiment === "bullish" ? colors.up : f.sentiment === "bearish" ? colors.down : colors.mutedForeground;
                return (
                  <View key={f.shortName} style={[styles.chip, { backgroundColor: c + "12", borderColor: c + "40" }]}>
                    <Text style={[styles.chipLbl, { color: colors.mutedForeground }]}>{f.shortName}</Text>
                    <Text style={[styles.chipVal, { color: c }]}>{f.score > 0 ? "+" : ""}{f.score}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.meterRow}>
            <View style={styles.segs}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={[styles.seg, { backgroundColor: i <= filled ? sigColor : colors.border, opacity: i <= filled ? 1 : 0.35 }]} />
              ))}
            </View>
            <Text style={[styles.meterLbl, { color: sigColor }]}>{analysis.qualityLabel}</Text>
            <Text style={[styles.meterPct, { color: colors.mutedForeground }]}>· {confidence}%</Text>
          </View>

          {/* Quality Score + Timeframe row */}
          {'signalQualityScore' in analysis && (analysis as { signalQualityScore: number }).signalQualityScore > 0 && (
            <View style={styles.qualityRow}>
              <View style={[styles.tfBadge, { borderColor: sigColor + "60", backgroundColor: sigColor + "12" }]}>
                <Text style={[styles.tfBadgeText, { color: sigColor }]}>
                  {'signalTimeframe' in analysis ? (analysis as { signalTimeframe: string }).signalTimeframe : "15m"} SETUP
                </Text>
              </View>
              <View style={[styles.qsBadge, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.qsLabel, { color: colors.mutedForeground }]}>Quality</Text>
                <Text style={[styles.qsValue, { color: sigColor }]}>{(analysis as { signalQualityScore: number }).signalQualityScore}/100</Text>
              </View>
              {'confirmedFactors' in analysis && (
                <View style={[styles.cfBadge, { borderColor: colors.border }]}>
                  <Text style={[styles.cfText, { color: colors.mutedForeground }]}>
                    {(analysis as { confirmedFactors: number; totalFactors: number }).confirmedFactors}/{(analysis as { confirmedFactors: number; totalFactors: number }).totalFactors} factors
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: sigColor + "30" }]} />
          {!!analysis.reasoning && (
            <Text style={[styles.reasoning, { color: colors.secondaryForeground }]}>{analysis.reasoning}</Text>
          )}
        </View>

        {/* Quick Levels */}
        {entry && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.sec, { color: colors.mutedForeground }]}>QUICK LEVELS</Text>
              <View style={[styles.smallBadge, { backgroundColor: sigColor + "20", borderColor: sigColor + "50" }]}>
                <Text style={[styles.smallBadgeText, { color: sigColor }]}>{analysis.signal}</Text>
              </View>
            </View>
            <View style={[styles.zoneRow, { backgroundColor: sigColor + "10", borderColor: sigColor + "30" }]}>
              <Text style={[styles.zoneKey, { color: colors.mutedForeground }]}>Entry Zone</Text>
              <Text style={[styles.zoneVal, { color: sigColor }]}>
                ${formatCoinPrice(entry.entryLow, selectedCoin)} – ${formatCoinPrice(entry.entryHigh, selectedCoin)}
              </Text>
            </View>
            <View style={styles.twoCol}>
              <View style={[styles.levelBox, { borderColor: colors.border }]}>
                <Text style={[styles.levelKey, { color: colors.mutedForeground }]}>Stop Loss</Text>
                <Text style={[styles.levelPct, { color: colors.down }]}>▼ {entry.riskPct.toFixed(2)}%</Text>
                <Text style={[styles.levelPrice, { color: colors.down }]}>${formatCoinPrice(entry.stopLoss, selectedCoin)}</Text>
              </View>
              <View style={[styles.levelBox, { borderColor: colors.border }]}>
                <Text style={[styles.levelKey, { color: colors.mutedForeground }]}>Take Profit 1</Text>
                <Text style={[styles.levelPct, { color: colors.up }]}>▲ {entry.tp1Pct.toFixed(2)}%</Text>
                <Text style={[styles.levelPrice, { color: colors.up }]}>${formatCoinPrice(entry.takeProfit1, selectedCoin)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Setup Readiness */}
        {analysis.ready && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>SETUP READINESS</Text>
            {[
              { label: "LONG",  readiness: analysis.setupTriggers.longReadiness,  met: analysis.setupTriggers.longMet,  color: colors.long  },
              { label: "SHORT", readiness: analysis.setupTriggers.shortReadiness, met: analysis.setupTriggers.shortMet, color: colors.short },
            ].map((r) => (
              <View key={r.label} style={styles.readRow}>
                <Text style={[styles.readLabel, { color: r.color }]}>{r.label}</Text>
                <View style={[styles.readTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.readFill, { width: `${r.readiness}%` as unknown as number, backgroundColor: r.color }]} />
                </View>
                <Text style={[styles.readPct, { color: r.color }]}>{r.readiness}%</Text>
                <Text style={[styles.readCount, { color: colors.mutedForeground }]}>{r.met}/4</Text>
              </View>
            ))}
          </View>
        )}

        {/* Trade Probability Engine */}
        <ProbabilityCard probability={probability} />

        {/* Chart */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/chart"); }}
        >
          <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.chartHead}>
              <Text style={[styles.sec, { color: colors.mutedForeground }]}>PRICE CHART · {coinConfig.ticker}</Text>
              <View style={styles.chartHeadRight}>
                <View style={styles.ivRow}>
                  {INTERVALS.map((iv) => {
                    const act = iv.value === interval;
                    return (
                      <Pressable
                        key={iv.value}
                        onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); setInterval(iv.value); }}
                        style={[styles.ivBtn, { backgroundColor: act ? colors.primary : "transparent", borderColor: act ? colors.primary : colors.border }]}
                      >
                        <Text style={[styles.ivText, { color: act ? "#fff" : colors.mutedForeground }]}>{iv.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.expandBadge, { borderColor: colors.border }]}>
                  <Feather name="maximize-2" size={11} color={colors.mutedForeground} />
                </View>
              </View>
            </View>

            <CandleChart
              candles={candles}
              loading={chartLoading}
              width={screenWidth - 32}
              height={200}
              upColor={colors.up}
              downColor={colors.down}
              gridColor={colors.border}
              labelColor={colors.mutedForeground}
            />

            <View style={styles.chartFooter}>
              <View style={styles.chartFooterLeft}>
                {levels.nearestSupport > 0 && (
                  <View style={styles.srPill}>
                    <Text style={[styles.srLabel, { color: colors.mutedForeground }]}>S</Text>
                    <Text style={[styles.srVal, { color: colors.up }]}>${formatCoinPrice(levels.nearestSupport, selectedCoin)}</Text>
                  </View>
                )}
                {levels.nearestResistance > 0 && (
                  <View style={styles.srPill}>
                    <Text style={[styles.srLabel, { color: colors.mutedForeground }]}>R</Text>
                    <Text style={[styles.srVal, { color: colors.down }]}>${formatCoinPrice(levels.nearestResistance, selectedCoin)}</Text>
                  </View>
                )}
                {levels.chartBias !== "Neutral" && (
                  <View style={[styles.biasPill, { borderColor: biasColor + "40", backgroundColor: biasColor + "12" }]}>
                    <Text style={[styles.biasText, { color: biasColor }]}>{levels.chartBias}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.updateTime, { color: colors.mutedForeground }]}>
                {lastKlineUpdate ? timeAgo(lastKlineUpdate) : "Loading…"}
              </Text>
            </View>

            <Text style={[styles.tapHint, { color: colors.mutedForeground }]}>
              Tap for full analysis · S/R levels · Entry overlays
            </Text>
          </View>
        </Pressable>

        {/* Market Overview */}
        <MarketOverviewCard />

        {/* Best Opportunities */}
        <BestOpportunitiesCard />

        {!!analysis.reasoning && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.sec, { color: colors.mutedForeground }]}>SIGNAL EXPLANATION</Text>
            <Text style={[styles.explText, { color: colors.secondaryForeground }]}>{analysis.reasoning}</Text>
          </View>
        )}

        <Text style={[styles.disc, { color: colors.mutedForeground }]}>
          Not financial advice · For informational use only
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 6 },
  pairRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  pair: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
  price: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  changeText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  liveGroup: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveTextCol: { gap: 1 },
  liveText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  ageText: { fontSize: 9, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },

  infoBar: { flexDirection: "row", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, marginBottom: 10, overflow: "hidden" },
  infoItem: { flex: 1, alignItems: "center", paddingVertical: 7, gap: 2 },
  infoKey: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },
  infoVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoDivider: { width: 1 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },

  sigCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sigTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sigNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coinDot: { width: 8, height: 8, borderRadius: 4 },
  coinLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  sigLabel: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  totalPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  totalPillText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  chipsRow: { flexDirection: "row", gap: 6 },
  chip: { flex: 1, borderRadius: 8, borderWidth: 1, paddingVertical: 8, alignItems: "center", gap: 3 },
  chipLbl: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase" },
  chipVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  segs: { flexDirection: "row", gap: 4 },
  seg: { width: 22, height: 5, borderRadius: 3 },
  meterLbl: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  meterPct: { fontSize: 11, fontFamily: "Inter_400Regular" },
  qualityRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tfBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tfBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  qsBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  qsLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  qsValue: { fontSize: 10, fontFamily: "Inter_700Bold" },
  cfBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderColor: "transparent" },
  cfText: { fontSize: 9, fontFamily: "Inter_400Regular" },
  divider: { height: 1, opacity: 0.4 },
  reasoning: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sec: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  smallBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  smallBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  zoneRow: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  zoneKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  zoneVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  twoCol: { flexDirection: "row", gap: 10 },
  levelBox: { flex: 1, borderRadius: 8, borderWidth: 1, padding: 10, gap: 3 },
  levelKey: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "uppercase" },
  levelPct: { fontSize: 11, fontFamily: "Inter_500Medium" },
  levelPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },

  readRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5, width: 40 },
  readTrack: { flex: 1, height: 5, borderRadius: 3, overflow: "hidden" },
  readFill: { height: 5, borderRadius: 3 },
  readPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 34, textAlign: "right" },
  readCount: { fontSize: 11, fontFamily: "Inter_400Regular", width: 22 },

  chartCard: { borderRadius: 14, borderWidth: 1, padding: 14, paddingBottom: 10, gap: 8 },
  chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartHeadRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  ivRow: { flexDirection: "row", gap: 4 },
  ivBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  ivText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  expandBadge: { borderWidth: 1, borderRadius: 6, padding: 5, borderColor: "transparent" },

  chartFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  chartFooterLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  srPill: { flexDirection: "row", alignItems: "center", gap: 3 },
  srLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  srVal: { fontSize: 11, fontFamily: "Inter_700Bold" },
  biasPill: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  biasText: { fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  updateTime: { fontSize: 9, fontFamily: "Inter_400Regular" },

  tapHint: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 2 },
  explText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  disc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, marginBottom: 4 },
});
